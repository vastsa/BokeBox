/** 上传面板：可接受的本地文件类型 */
export const UPLOAD_ACCEPT = [
  // 视频
  '.mp4,.mov,.webm,.mkv,.avi,.m4v,.mpeg,.mpg,.ts,.flv,video/*',
  // 音频
  '.mp3,.m4a,.wav,.aac,.ogg,.flac,.opus,.wma,audio/*',
  // 文本
  '.txt,.md,.markdown,.html,.htm,.json,.csv,.xml,.log,.srt,.vtt,text/*',
].join(',');

export type SourceMode = 'file' | 'url';
export type OptionPanel = 'none' | 'tts' | 'prompt';
