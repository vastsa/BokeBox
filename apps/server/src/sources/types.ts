/**
 * Source 插件抽象（内容获取层）
 *
 * 核心流水线只消费 SourceArtifact，不关心具体平台/抓取实现。
 * 高风险获取（yt-dlp / Firecrawl 等）应作为可选插件注册，默认不启用。
 */
import type { SourceKind } from '../types/job.js';

/** 插件风险等级：用于 UI 提示与默认启用策略 */
export type SourceRiskLevel = 'low' | 'medium' | 'high';

/** 插件能力标签 */
export type SourceCapability = 'url' | 'file' | 'webpage' | 'media';

/** 统一输入：当前阶段以 URL 为主，预留 file 扩展 */
export type SourceInput =
  | {
      type: 'url';
      url: string;
      jobId: string;
      /** 指定插件 id；缺省则自动匹配 */
      pluginId?: string;
    }
  | {
      type: 'file';
      filePath: string;
      jobId: string;
      filename?: string;
      mimeType?: string;
      pluginId?: string;
    };

/**
 * 统一产出：pipeline / job 只依赖此结构。
 * 与历史 ImportResult 字段对齐，便于渐进迁移。
 */
export interface SourceArtifact {
  kind: SourceKind;
  /** 落盘后的本地源文件路径（媒体或清洗后的文本） */
  localPath: string;
  mimeType: string;
  size: number;
  filename: string;
  /** 文本类正文（可选，文本任务可直接进 ASR 跳过路径） */
  textContent?: string;
  /** 建议任务标题 */
  title?: string;
  /** 最终来源 URL（重定向后） */
  sourceUrl?: string;
  /** 产出该 artifact 的插件 id */
  pluginId: string;
  /** 插件内部策略标记，仅调试用 */
  strategy?: string;
  rawMeta?: Record<string, unknown>;
}

export interface SourceProbe {
  /** 插件是否声明可处理 */
  handled: boolean;
  /** 可选：探测到的标题/类型提示 */
  title?: string;
  kindHint?: SourceKind;
  message?: string;
}

export interface SourcePluginContext {
  jobId: string;
  /** 任务工作目录等扩展位 */
  signal?: AbortSignal;
}

export interface SourcePlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly riskLevel: SourceRiskLevel;
  readonly capabilities: readonly SourceCapability[];
  /**
   * 默认是否启用。
   * 高风险插件必须为 false，需用户显式开启。
   */
  readonly defaultEnabled: boolean;
  /** 当前进程内是否可用（依赖/配置是否就绪） */
  isAvailable(): boolean;
  /** 是否声明可处理该输入（快速匹配，不做重 IO） */
  canHandle(input: SourceInput): boolean;
  /** 可选：轻量探测（不落盘） */
  probe?(input: SourceInput, ctx: SourcePluginContext): Promise<SourceProbe>;
  /** 拉取并规范化为 SourceArtifact */
  fetch(input: SourceInput, ctx: SourcePluginContext): Promise<SourceArtifact>;
}

export interface SourcePluginDescriptor {
  id: string;
  name: string;
  description: string;
  version: string;
  riskLevel: SourceRiskLevel;
  capabilities: SourceCapability[];
  defaultEnabled: boolean;
  /** 配置层是否启用（未配置时回落 defaultEnabled） */
  enabled: boolean;
  available: boolean;
}
