/**
 * AIPanel
 * Enhanced AI assistant UI inspired by Claudix
 * Provides improved message rendering, attachments, token usage, and polished UI
 *
 * To use the legacy version, import from './AIPanel-Legacy.tsx'
 */
export { AIPanel } from './AIPanel-Enhanced';

// Legacy exports for backwards compatibility
export type { ChatMessage, ToolCallInfo } from '@/lib/artificial-intelligence/ai-sdk';
export type { UIMessage, AttachmentItem } from './types';
