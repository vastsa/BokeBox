import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, pathExists, removeDirIfExists, removeIfExists } from '../../utils/fs.js';
import { getPluginConfig } from '../../plugin-kit/persist.js';
import type {
  AsrPluginContext,
  AsrProvider,
  AsrTranscribeInput,
  AsrTranscribeResult,
} from './types.js';

type WhisperFlavor = 'openai' | 'cpp' | 'unknown';

interface ResolvedWhisper {
  bin: string;
  flavor: WhisperFlavor;
}

function pluginWhisperConfig(): { bin: string; lang: string; model: string } {
  const cfg = getPluginConfig('asr', 'local-whisper');
  return {
    bin: String(cfg.bin || '').trim(),
    lang: String(cfg.lang || '').trim(),
    model: String(cfg.model || '').trim(),
  };
}

/** 优先插件配置，其次环境变量（兼容） */
function configuredBin(ctx?: AsrPluginContext): string {
  const fromCtx = String(ctx?.getConfig?.('bin') ?? '').trim();
  return (
    fromCtx ||
    pluginWhisperConfig().bin ||
    process.env.BOKEBOX_WHISPER_BIN ||
    process.env.WHISPER_BIN ||
    process.env.WHISPER_CPP_BIN ||
    ''
  ).trim();
}

function configuredLang(
  inputLang?: string,
  ctx?: AsrPluginContext,
): string | undefined {
  const fromCtx = String(ctx?.getConfig?.('lang') ?? '').trim();
  const lang = (
    inputLang ||
    fromCtx ||
    pluginWhisperConfig().lang ||
    process.env.BOKEBOX_WHISPER_LANG ||
    ''
  ).trim();
  return lang || undefined;
}

async function commandExists(bin: string): Promise<boolean> {
  if (!bin) return false;
  // 绝对/相对路径
  if (bin.includes('/') || bin.includes('\\')) {
    return pathExists(bin);
  }
  return await new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const child = spawn(bin, ['--help'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      shell: false,
    });
    child.on('error', () => done(false));
    child.on('close', (code) => {
      done(code === 0 || code === 1 || code === 2);
    });
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      done(false);
    }, 2500);
  });
}

async function whichOnPath(names: string[]): Promise<string | null> {
  for (const name of names) {
    if (await commandExists(name)) return name;
  }
  return null;
}

function detectFlavor(bin: string): WhisperFlavor {
  const base = path.basename(bin).toLowerCase();
  if (base.includes('cpp') || base.includes('whisper-cli') || base === 'main') {
    return 'cpp';
  }
  if (base === 'whisper' || base.includes('openai')) return 'openai';
  return 'unknown';
}

/** 解析本地 Whisper 可执行文件 */
export async function resolveWhisperBinary(
  ctx?: AsrPluginContext,
): Promise<ResolvedWhisper | null> {
  const configured = configuredBin(ctx);
  if (configured) {
    if (await commandExists(configured)) {
      return { bin: configured, flavor: detectFlavor(configured) };
    }
    return null;
  }

  // 常见命令名（openai-whisper / whisper.cpp）
  const found = await whichOnPath([
    'whisper',
    'whisper-cli',
    'whisper.cpp',
    'whisper-cpp',
  ]);
  if (!found) return null;
  return { bin: found, flavor: detectFlavor(found) };
}

function runProcess(
  bin: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(
      () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        reject(new Error(`本地 Whisper 超时（${Math.round((opts?.timeoutMs || 0) / 1000)}s）`));
      },
      opts?.timeoutMs || 30 * 60 * 1000,
    );
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function readFirstTxt(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir);
  const txts = entries.filter((n) => n.toLowerCase().endsWith('.txt'));
  if (!txts.length) return null;
  // 优先非 .json 的转写正文
  const preferred =
    txts.find((n) => !n.includes('.json')) || txts[0];
  const text = await fs.readFile(path.join(dir, preferred), 'utf8');
  return text.trim() || null;
}

/**
 * openai-whisper CLI：
 * whisper audio.mp3 --model base --output_format txt --output_dir DIR --verbose False
 */
async function runOpenAiWhisper(
  bin: string,
  audioPath: string,
  model: string,
  language?: string,
): Promise<string> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bokebox-whisper-'));
  try {
    const args = [
      audioPath,
      '--model',
      model,
      '--output_format',
      'txt',
      '--output_dir',
      outDir,
      '--verbose',
      'False',
    ];
    if (language) {
      args.push('--language', language);
    }

    const { code, stdout, stderr } = await runProcess(bin, args);
    if (code !== 0) {
      throw new Error(
        `openai-whisper 退出码 ${code}: ${(stderr || stdout).slice(-800)}`,
      );
    }

    const fromFile = await readFirstTxt(outDir);
    if (fromFile) return fromFile;

    // 少数版本只打 stdout
    const text = stdout.trim();
    if (text) return text;
    throw new Error('openai-whisper 未生成转写文本');
  } finally {
    await removeDirIfExists(outDir);
  }
}

/**
 * whisper.cpp CLI（whisper-cli / main）：
 * whisper-cli -m MODEL -f audio.wav -otxt -of outprefix
 */
async function runCppWhisper(
  bin: string,
  audioPath: string,
  model: string,
  language?: string,
): Promise<string> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bokebox-wcpp-'));
  const outPrefix = path.join(outDir, 'transcript');
  try {
    // model 可为 ggml 文件路径，或短名（需用户配置完整路径更稳妥）
    const modelArg = model;
    const args = ['-m', modelArg, '-f', audioPath, '-otxt', '-of', outPrefix];
    if (language) {
      args.push('-l', language);
    }

    const { code, stdout, stderr } = await runProcess(bin, args);
    if (code !== 0) {
      throw new Error(
        `whisper.cpp 退出码 ${code}: ${(stderr || stdout).slice(-800)}`,
      );
    }

    const txtPath = `${outPrefix}.txt`;
    if (await pathExists(txtPath)) {
      const text = (await fs.readFile(txtPath, 'utf8')).trim();
      if (text) return text;
    }
    const fromDir = await readFirstTxt(outDir);
    if (fromDir) return fromDir;
    const text = stdout.trim();
    if (text) return text;
    throw new Error('whisper.cpp 未生成转写文本');
  } finally {
    await removeDirIfExists(outDir);
    await removeIfExists(`${outPrefix}.txt`);
  }
}

function installHint(): string {
  return [
    '未找到本地 Whisper 可执行文件。',
    '安装任选其一后重试：',
    '  1) pip install -U openai-whisper   # 命令：whisper',
    '  2) 安装 whisper.cpp 并保证 whisper-cli 在 PATH',
    '请在「插件 → 语音转写 → 本地 Whisper」填写可执行文件路径，',
    '或保证 whisper / whisper-cli 在系统 PATH 中。',
    '模型名写在插件「默认模型」：openai-whisper 用 tiny/base/small/medium/large；',
    'whisper.cpp 建议填 ggml 模型文件绝对路径。',
  ].join('\n');
}

/**
 * 本地 Whisper ASR
 * - 优先 openai-whisper CLI
 * - 兼容 whisper.cpp（whisper-cli）
 * - 不依赖云端 API Key
 */
export const localWhisperAsrProvider: AsrProvider = {
  id: 'local-whisper',
  name: '本地 Whisper',
  description: '本机 openai-whisper / whisper.cpp，无需云端 Key',
  suggestedModel: 'base',
  strictAvailability: true,
  isAvailable() {
    // 配置了绝对路径则检查文件存在；否则保持可选（转写时再解析 PATH）
    const configured = configuredBin();
    if (configured) {
      return fsSync.existsSync(configured);
    }
    return true;
  },
  async transcribe(
    input: AsrTranscribeInput,
    ctx?: AsrPluginContext,
  ): Promise<AsrTranscribeResult> {
    const resolved = await resolveWhisperBinary(ctx);
    if (!resolved) {
      throw new Error(installHint());
    }

    const pluginModel =
      String(ctx?.getConfig?.('model') ?? '').trim() ||
      pluginWhisperConfig().model;
    const model = (input.model?.trim() || pluginModel || 'base').trim();
    const language = configuredLang(input.language, ctx);
    await ensureDir(path.dirname(input.audioPath));

    let text: string;
    if (resolved.flavor === 'cpp') {
      text = await runCppWhisper(
        resolved.bin,
        input.audioPath,
        model,
        language,
      );
    } else {
      // unknown 也按 openai-whisper 参数尝试；失败再提示
      try {
        text = await runOpenAiWhisper(
          resolved.bin,
          input.audioPath,
          model,
          language,
        );
      } catch (err) {
        if (resolved.flavor === 'unknown') {
          try {
            text = await runCppWhisper(
              resolved.bin,
              input.audioPath,
              model,
              language,
            );
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    const cleaned = text
      .replace(/\r\n/g, '\n')
      // whisper 有时带时间戳行 [00:00.000 --> 00:01.000]
      .replace(/^\s*\[?\d{1,2}:\d{2}(?:\.\d+)?\s*-->\s*\d{1,2}:\d{2}(?:\.\d+)?\]?\s*/gm, '')
      .trim();
    if (!cleaned) throw new Error('本地 Whisper 转写结果为空');

    return {
      text: cleaned,
      provider: 'local-whisper',
      model,
      demo: false,
    };
  },
};
