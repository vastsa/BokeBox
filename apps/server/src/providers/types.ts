/** 通用 Provider 标识 */
export type ProviderId = string;

export interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  description: string;
  /** 是否已注册且当前配置下可用 */
  available: boolean;
  /** 插件层是否启用 */
  enabled?: boolean;
  /** 是否为 settings 中当前激活提供方 */
  active?: boolean;
  /** 建议默认模型（仅供 UI 提示） */
  suggestedModels?: Record<string, string>;
}
