/**
 * Shared types for AI components
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallInfo[];
  tool_call_id?: string;
}

export interface ToolCallInfo {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface UITextMessage {
  kind: "text";
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export interface UIToolCallMessage {
  kind: "tool_call";
  callId: string;
  name: string;
  args: string;
  result?: string;
  collapsed?: boolean;
  status?: "running" | "success" | "error";
  timestamp?: number;
}

export type UIMessage = UITextMessage | UIToolCallMessage;

export interface AttachmentItem {
  id: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  data?: string | ArrayBuffer;
}

export interface CompletionItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  data?: any;
}
