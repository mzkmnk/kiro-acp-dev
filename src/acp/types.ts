// ============================================================
// JSON-RPC 2.0 基本型
// ============================================================

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// ============================================================
// initialize
// ============================================================

export interface ClientCapabilities {
  fs: { readTextFile: boolean; writeTextFile: boolean };
  terminal: boolean;
}

export interface ClientInfo {
  name: string;
  title?: string;
  version: string;
}

export interface InitializeParams {
  protocolVersion: number;
  clientCapabilities: ClientCapabilities;
  clientInfo: ClientInfo;
}

export interface AgentCapabilities {
  loadSession: boolean;
  promptCapabilities: { image: boolean };
}

export interface AgentInfo {
  name: string;
  version: string;
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities: AgentCapabilities;
  agentInfo: AgentInfo;
}

// ============================================================
// session/new
// ============================================================

export interface EnvVariable {
  name: string;
  value: string;
}

export interface McpServerConfigStdio {
  name: string;
  command: string;
  args: string[];
  env?: EnvVariable[];
}

export interface McpServerConfigHttp {
  type: "http";
  name: string;
  url: string;
  headers: { name: string; value: string }[];
}

export interface McpServerConfigSse {
  type: "sse";
  name: string;
  url: string;
  headers: { name: string; value: string }[];
}

export type McpServerConfig =
  | McpServerConfigStdio
  | McpServerConfigHttp
  | McpServerConfigSse;

export interface SessionNewParams {
  cwd: string;
  mcpServers: McpServerConfig[];
}

export interface SessionNewResult {
  sessionId: string;
}

// ============================================================
// session/load
// ============================================================

export interface SessionLoadParams {
  sessionId: string;
  cwd: string;
  mcpServers: McpServerConfig[];
}

// ============================================================
// Content 型
// ============================================================

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
  uri?: string;
}

export interface ResourceLinkContent {
  type: "resource_link";
  uri: string;
  name: string;
  mimeType?: string;
  title?: string;
  description?: string;
  size?: number;
}

export interface EmbeddedResourceContent {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

export type PromptContent =
  | TextContent
  | ImageContent
  | ResourceLinkContent
  | EmbeddedResourceContent;

// ============================================================
// session/prompt
// ============================================================

export interface SessionPromptParams {
  sessionId: string;
  prompt: PromptContent[];
}

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

export interface SessionPromptResult {
  stopReason: StopReason;
}

// ============================================================
// session/cancel (Notification — id なし)
// ============================================================

export interface SessionCancelParams {
  sessionId: string;
}

// ============================================================
// session/update (Agent → Client Notification)
// ============================================================

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "other";

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolCallContentBlock {
  type: "content";
  content: TextContent | ImageContent;
}

export interface ToolCallDiffContent {
  type: "diff";
  path: string;
  oldText?: string;
  newText: string;
}

export interface ToolCallTerminalContent {
  type: "terminal";
  terminalId: string;
}

export type ToolCallContent =
  | ToolCallContentBlock
  | ToolCallDiffContent
  | ToolCallTerminalContent;

export interface ToolCallLocation {
  path: string;
  line?: number;
}

export interface AgentMessageChunk {
  sessionUpdate: "agent_message_chunk";
  content: TextContent | ImageContent;
}

export interface UserMessageChunk {
  sessionUpdate: "user_message_chunk";
  content: TextContent | ImageContent;
}

export interface ToolCall {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

export interface ToolCallUpdate {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
}

export interface TurnEnd {
  sessionUpdate: "turn_end";
}

export interface CurrentModeUpdate {
  sessionUpdate: "current_mode_update";
  modeId: string;
}

export interface AvailableCommandInput {
  hint: string;
}

export interface AvailableCommand {
  name: string;
  description: string;
  input?: AvailableCommandInput;
}

export interface AvailableCommandsUpdate {
  sessionUpdate: "available_commands_update";
  availableCommands: AvailableCommand[];
}

export type SessionUpdate =
  | AgentMessageChunk
  | UserMessageChunk
  | ToolCall
  | ToolCallUpdate
  | TurnEnd
  | CurrentModeUpdate
  | AvailableCommandsUpdate;

export interface SessionUpdateParams {
  sessionId: string;
  update: SessionUpdate;
}

// ============================================================
// Agent → Client リクエスト: File System
// ============================================================

export interface FsReadTextFileParams {
  sessionId: string;
  path: string;
  line?: number;
  limit?: number;
}

export interface FsWriteTextFileParams {
  sessionId: string;
  path: string;
  content: string;
}

// ============================================================
// Agent → Client リクエスト: Permission
// ============================================================

export type PermissionOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export interface SessionRequestPermissionParams {
  sessionId: string;
  toolCall: ToolCallUpdate;
  options: PermissionOption[];
}

export type RequestPermissionOutcome =
  | { outcome: "cancelled" }
  | { outcome: "selected"; optionId: string };

export interface SessionRequestPermissionResult {
  outcome: RequestPermissionOutcome;
}

// ============================================================
// Agent → Client リクエスト: Terminal
// ============================================================

export interface TerminalCreateParams {
  sessionId: string;
  command: string;
  args?: string[];
  env?: EnvVariable[];
  cwd?: string;
  outputByteLimit?: number;
}

export interface TerminalCreateResult {
  terminalId: string;
}

export interface TerminalOutputParams {
  sessionId: string;
  terminalId: string;
}

export interface TerminalExitStatus {
  exitCode: number | null;
  signal: string | null;
}

export interface TerminalOutputResult {
  output: string;
  truncated: boolean;
  exitStatus?: TerminalExitStatus;
}

export interface TerminalWaitForExitParams {
  sessionId: string;
  terminalId: string;
}

export interface TerminalWaitForExitResult {
  exitCode: number | null;
  signal: string | null;
}

export interface TerminalKillParams {
  sessionId: string;
  terminalId: string;
}

export interface TerminalReleaseParams {
  sessionId: string;
  terminalId: string;
}

// ============================================================
// session/set_mode, session/set_model
// ============================================================

export interface SessionSetModeParams {
  sessionId: string;
  modeId: string;
}

export interface SessionSetModelParams {
  sessionId: string;
  modelId: string;
}

// ============================================================
// Kiro 独自拡張メソッド型 (_kiro.dev/ プレフィックス)
// ============================================================

// _kiro.dev/commands/execute (Request)
export interface KiroCommandsExecuteParams {
  sessionId: string;
  command: string;
}

// _kiro.dev/commands/options (Request)
export interface KiroCommandsOptionsParams {
  sessionId: string;
  command: string;
}

export interface KiroCommandOption {
  label: string;
  value: string;
}

export interface KiroCommandsOptionsResult {
  options: KiroCommandOption[];
}

// _kiro.dev/commands/available (Notification)
export interface KiroCommandsAvailableParams {
  sessionId: string;
  commands: AvailableCommand[];
}

// _kiro.dev/mcp/oauth_request (Notification)
export interface KiroMcpOauthRequestParams {
  sessionId: string;
  url: string;
}

// _kiro.dev/mcp/server_initialized (Notification)
export interface KiroMcpServerInitializedParams {
  sessionId: string;
  serverName: string;
}

// _kiro.dev/compaction/status (Notification)
export interface KiroCompactionStatusParams {
  sessionId: string;
  status: string;
}

// _kiro.dev/clear/status (Notification)
export interface KiroClearStatusParams {
  sessionId: string;
  status: string;
}

// _session/terminate (Notification)
export interface SessionTerminateParams {
  sessionId: string;
}
