/** 与服务端 edgeTts 预置音色对齐，供 Setup / 设置页下拉使用 */
export const EDGE_VOICE_OPTIONS: Array<{
  id: string;
  name: string;
  language: string;
}> = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', language: '中文' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', language: '中文' },
  { id: 'zh-CN-YunxiNeural', name: '云希', language: '中文' },
  { id: 'zh-CN-YunjianNeural', name: '云健', language: '中文' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', language: '中文' },
  { id: 'zh-CN-XiaochenNeural', name: '晓辰', language: '中文' },
  { id: 'zh-CN-XiaohanNeural', name: '晓涵', language: '中文' },
  { id: 'zh-CN-XiaomengNeural', name: '晓梦', language: '中文' },
  { id: 'zh-CN-XiaomoNeural', name: '晓墨', language: '中文' },
  { id: 'zh-CN-XiaoruiNeural', name: '晓睿', language: '中文' },
  { id: 'zh-CN-XiaoshuangNeural', name: '晓双', language: '中文' },
  { id: 'zh-CN-XiaoxuanNeural', name: '晓萱', language: '中文' },
  { id: 'zh-CN-YunfengNeural', name: '云枫', language: '中文' },
  { id: 'zh-CN-YunhaoNeural', name: '云皓', language: '中文' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏', language: '中文' },
  { id: 'zh-CN-YunyeNeural', name: '云野', language: '中文' },
  { id: 'zh-CN-YunzeNeural', name: '云泽', language: '中文' },
  { id: 'en-US-AriaNeural', name: 'Aria', language: '英文' },
  { id: 'en-US-JennyNeural', name: 'Jenny', language: '英文' },
  { id: 'en-US-GuyNeural', name: 'Guy', language: '英文' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher', language: '英文' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', language: '英文(英式)' },
];

/** 与服务端 openaiTts 预置音色对齐 */
export const OPENAI_VOICE_OPTIONS: Array<{
  id: string;
  name: string;
  language: string;
}> = [
  { id: 'alloy', name: 'Alloy', language: '多语' },
  { id: 'ash', name: 'Ash', language: '多语' },
  { id: 'ballad', name: 'Ballad', language: '多语' },
  { id: 'coral', name: 'Coral', language: '多语' },
  { id: 'echo', name: 'Echo', language: '多语' },
  { id: 'fable', name: 'Fable', language: '多语' },
  { id: 'onyx', name: 'Onyx', language: '多语' },
  { id: 'nova', name: 'Nova', language: '多语' },
  { id: 'sage', name: 'Sage', language: '多语' },
  { id: 'shimmer', name: 'Shimmer', language: '多语' },
  { id: 'verse', name: 'Verse', language: '多语' },
];

/** openai-whisper 常用模型 */
export const WHISPER_MODEL_OPTIONS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large',
  'large-v2',
  'large-v3',
] as const;

export const WHISPER_LANG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: '自动检测' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: '英文' },
  { id: 'ja', label: '日文' },
  { id: 'ko', label: '韩文' },
  { id: 'yue', label: '粤语' },
];
