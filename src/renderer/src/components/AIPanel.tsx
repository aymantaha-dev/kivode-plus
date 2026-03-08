import { BrandLogo } from '@renderer/components/BrandLogo';
// src/renderer/components/AIPanel/AIPanel.tsx
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useAppStore } from '@renderer/stores/useAppStore';
import { Button } from '@renderer/components/ui/button';
import { Textarea } from '@renderer/components/ui/textarea';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { cn } from '@renderer/utils/helpers';
import { 
  Send, 
  Bot, 
  Sparkles, 
  Code2, 
  FileEdit, 
  Search,
  BookOpen,
  FolderPlus,
  Loader2,
  Copy,
  Check,
  History,
  Trash2,
  X,
  MessageSquare,
  FolderTree,
  FileCode,
  RefreshCw,
  ChevronDown,
  Cpu,
  Zap,
  Shield,
  Terminal,
  Braces,
  CpuIcon,
  Square,
  RotateCcw,
  Upload,
  AlertCircle,
  Keyboard,
  Save,
  Paperclip,
  Image as ImageIcon,
  File,
  FileText,
  FileJson,
  FileSpreadsheet,
  FileArchive,
  Wand2,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AIModel, ApiProvider, PythonEnvInspection } from '@main/preload';

// Refined interface contracts.
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  type?: 'assist' | 'context';
  files?: string[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  projectContext: {
    path: string | null;
    fileTree: any[];
    openFiles: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_CHAT_TITLE = 'New Chat';
const TITLE_SOURCE_MESSAGE_LIMIT = 6;
const MIN_USER_MESSAGES_FOR_TITLE = 3;

interface GeneratedProjectFile {
  path: string;
  content: string;
}

interface AttachedFile {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  encoding: 'utf-8' | 'base64';
  content: string;
  summary?: {
    chars: number;
    lines: number;
    functions: number;
    classes: number;
    imports: number;
    preview: string;
  };
}

type AssistantMode = 'chat' | 'code';

interface SandboxTask {
  id: string;
  title: string;
  type: string;
  status: 'pending_approval' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  createdAt: string;
  input: Record<string, any>;
  logs: string[];
  result?: {
    summary?: string;
    stdout?: string;
    stderr?: string;
    artifacts?: string[];
    durationMs?: number;
    data?: Record<string, any>;
  };
}

// Enhanced system prompt.
const SYSTEM_PROMPT = `You are Kivode+ AI, an expert coding assistant.
Guidelines:
- You are in EDITING MODE for existing projects only
- Always return JSON editing instructions suitable for diff-based workflows
- Prefer minimal, safe, and reversible modifications
- Use best practices and modern patterns
- Include error handling where relevant`;


const getProviderStrictJsonPrompt = (modelId: string | null | undefined, task: 'classifier' | 'planner' | 'editor' | 'repair' | 'file_repair' = 'editor') => {
  const id = String(modelId || '').toLowerCase();
  const base = [
    'You are operating in machine-action mode.',
    'Respond with STRICT JSON only.',
    'Do not use markdown, prose, code fences, comments, or explanations outside JSON.',
    'If context is missing, return: {"action":"needs_context","reason":"..."}.',
  ].join('\n');

  const taskRules: Record<typeof task, string> = {
    classifier: 'Output schema: {"intent":"edit"|"chat","reason":"..."}. Return exactly one object.',
    planner: 'Output schema: {"paths":["relative/path"],"reason":"..."}. Keep list short and relevant.',
    editor: 'Output action objects only: apply_patch, replace_body, create_file, open_file, needs_context. Multi-step is {"actions":[...]}.',
    repair: 'Convert previous output into valid JSON action object(s) only. Preserve intent and avoid full-file rewrites.',
    file_repair: 'Output schema: {"files":[{"path":"relative/path.ext","content":"full content"}]}. Return valid JSON object only.',
  };

  if (id.includes('claude')) {
    return `${base}\n${taskRules[task]}\nClaude-specific rule: never add XML tags or conversational prefaces.`;
  }
  if (id.includes('gemini')) {
    return `${base}\n${taskRules[task]}\nGemini-specific rule: never wrap JSON in markdown fences and never prepend safety narratives.`;
  }
  if (id.includes('deepseek')) {
    return `${base}\n${taskRules[task]}\nDeepSeek-specific rule: avoid natural-language summaries; return minified or regular JSON only.`;
  }
  if (id.includes('kimi') || id.includes('moonshot')) {
    return `${base}\n${taskRules[task]}\nKimi-specific rule: output exactly one JSON payload with no trailing commentary.`;
  }
  return `${base}\n${taskRules[task]}\nOpenAI-style rule: deterministic JSON-only response.`;
};

// Transparent provider logos that follow the active theme color.
const OpenAIIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>OpenAI</title>
    <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"></path>
  </svg>
);

const AnthropicIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>Anthropic</title>
    <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"></path>
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>Google</title>
    <path d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z"></path>
    <path d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z"></path>
    <path d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z"></path>
    <path d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z"></path>
  </svg>
);

const DeepSeekIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>DeepSeek</title>
    <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"></path>
  </svg>
);

const MoonshotIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>Kimi</title>
    <path d="M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z"></path>
    <path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z"></path>
  </svg>
);

// Model catalog aligned to the AIModel contract.
const AVAILABLE_MODELS: AIModel[] = [
  // =========================
  // OpenAI
  // =========================
  { 
    id: 'gpt-5.2', 
    name: 'GPT-5.2', 
    provider: 'openai', 
    category: 'code',
    description: 'Latest GPT-5.2 for advanced coding tasks',
    maxTokens: 200000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.openai.com/v1/responses',
    apiModelId: 'gpt-5.2',
    icon: 'openai'
  },
  { 
    id: 'gpt-5.1', 
    name: 'GPT-5.1', 
    provider: 'openai', 
    category: 'code',
    description: 'GPT-5.1 for complex code generation',
    maxTokens: 200000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.openai.com/v1/responses',
    apiModelId: 'gpt-5.1',
    icon: 'openai'
  },
  { 
    id: 'gpt-5', 
    name: 'GPT-5', 
    provider: 'openai', 
    category: 'code',
    description: 'Base GPT-5 model',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.openai.com/v1/responses',
    apiModelId: 'gpt-5',
    icon: 'openai'
  },
  { 
    id: 'gpt-4.1', 
    name: 'GPT-4.1', 
    provider: 'openai', 
    category: 'code',
    description: 'GPT-4.1 optimized for code',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.openai.com/v1/responses',
    apiModelId: 'gpt-4.1',
    icon: 'openai'
  },
  { 
    id: 'gpt-4.1-mini', 
    name: 'GPT-4.1 Mini', 
    provider: 'openai', 
    category: 'code',
    description: 'Fast and efficient GPT-4.1 Mini',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.openai.com/v1/responses',
    apiModelId: 'gpt-4.1-mini',
    icon: 'openai'
  },

  // =========================
  // Anthropic (Claude)
  // =========================
  { 
    id: 'claude-opus-4.5', 
    name: 'Claude Opus 4.5', 
    provider: 'anthropic', 
    category: 'code',
    description: 'Most capable Claude for complex tasks',
    maxTokens: 200000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    apiModelId: 'claude-3-opus-latest',
    icon: 'anthropic'
  },
  { 
    id: 'claude-sonnet-4.5', 
    name: 'Claude Sonnet 4.5', 
    provider: 'anthropic', 
    category: 'code',
    description: 'Balanced performance and speed',
    maxTokens: 200000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    apiModelId: 'claude-3-sonnet-latest',
    icon: 'anthropic'
  },
  { 
    id: 'claude-haiku-4.5', 
    name: 'Claude Haiku 4.5', 
    provider: 'anthropic', 
    category: 'documentation',
    description: 'Fast and cost-effective',
    maxTokens: 200000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    apiModelId: 'claude-3-haiku-latest',
    icon: 'anthropic'
  },

  // =========================
  // Moonshot (Kimi)
  // =========================
  { 
    id: 'kimi-k2.5', 
    name: 'Kimi K2.5', 
    provider: 'moonshot', 
    category: 'code',
    description: 'Latest Kimi K2.5 with 256K context',
    maxTokens: 256000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    apiModelId: 'kimi-k2-0711-preview',
    icon: 'moonshot'
  },
  { 
    id: 'kimi-k2', 
    name: 'Kimi K2', 
    provider: 'moonshot', 
    category: 'code',
    description: 'Kimi K2 for long context',
    maxTokens: 200000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    apiModelId: 'kimi-k2-0711-preview',
    icon: 'moonshot'
  },
  { 
    id: 'kimi-k1.5', 
    name: 'Kimi K1.5', 
    provider: 'moonshot', 
    category: 'code',
    description: 'Kimi K1.5 optimized',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    apiModelId: 'kimi-1.5-long',
    icon: 'moonshot'
  },

  // =========================
  // DeepSeek
  // =========================
  { 
    id: 'deepseek-v3', 
    name: 'DeepSeek-V3', 
    provider: 'deepseek', 
    category: 'code',
    description: 'DeepSeek V3 general purpose',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiModelId: 'deepseek-chat',
    icon: 'deepseek'
  },
  { 
    id: 'deepseek-coder-v2', 
    name: 'DeepSeek Coder V2', 
    provider: 'deepseek', 
    category: 'code',
    description: 'Specialized for coding',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiModelId: 'deepseek-coder',
    icon: 'deepseek'
  },
  { 
    id: 'deepseek-chat', 
    name: 'DeepSeek Chat', 
    provider: 'deepseek', 
    category: 'documentation',
    description: 'General chat capabilities',
    maxTokens: 128000,
    supportsStreaming: true,
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiModelId: 'deepseek-chat',
    icon: 'deepseek'
  },

  // =========================
  // Google (Gemini)
  // =========================
  { 
    id: 'gemini-1.5-pro', 
    name: 'Gemini 1.5 Pro', 
    provider: 'google', 
    category: 'code',
    description: 'Gemini 1.5 Pro for complex tasks',
    maxTokens: 2000000,
    supportsStreaming: true,
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent',
    apiModelId: 'gemini-1.5-pro-latest',
    icon: 'google'
  },
  { 
    id: 'gemini-1.5-flash', 
    name: 'Gemini 1.5 Flash', 
    provider: 'google', 
    category: 'documentation',
    description: 'Fast Gemini 1.5 Flash',
    maxTokens: 1000000,
    supportsStreaming: true,
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
    apiModelId: 'gemini-1.5-flash-latest',
    icon: 'google'
  },
];

// Shared constants.
const PROVIDER_COLORS: Record<ApiProvider, string> = {
  openai: 'from-emerald-500 to-teal-600',
  anthropic: 'from-orange-500 to-amber-600',
  moonshot: 'from-violet-500 to-purple-600',
  deepseek: 'from-blue-500 to-cyan-600',
  google: 'from-rose-500 to-pink-600',
  pollinations: 'from-green-500 to-lime-600',
};

const PROVIDER_BG_COLORS: Record<ApiProvider, string> = {
  openai: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  anthropic: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  moonshot: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  deepseek: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  google: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  pollinations: 'bg-green-500/10 text-green-600 border-green-500/20',
};

const PROVIDER_NAMES: Record<ApiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  moonshot: 'Moonshot AI',
  deepseek: 'DeepSeek',
  google: 'Google',
  pollinations: 'Pollinations',
};

type OperationType = 'assist';

// IconProvider with transparent background.
const ProviderIcon = ({ provider, className }: { provider: ApiProvider; className?: string }) => {
  switch (provider) {
    case 'openai': return <OpenAIIcon className={className} />;
    case 'anthropic': return <AnthropicIcon className={className} />;
    case 'moonshot': return <MoonshotIcon className={className} />;
    case 'deepseek': return <DeepSeekIcon className={className} />;
    case 'google': return <GoogleIcon className={className} />;
    default: return <Bot className={className} />;
  }
};

// Maps runtime errors to readable user-facing messages.
const isRequestInFlightError = (error: any): boolean => {
  const message = error?.message || '';
  const code = error?.code || error?.errorCode;
  return code === 'REQUEST_IN_FLIGHT' || message.includes('REQUEST_IN_FLIGHT');
};

const getErrorMessage = (error: any): string => {
  const message = error?.message || '';
  const statusCode = error?.response?.status || error?.status;

  // Rate limit
  if (statusCode === 429 || message.includes('429') || message.includes('RATE_LIMIT')) {
    return `⏱️ **Too Many Requests**\n\nYou've sent too many requests in a short time. Please wait 30-60 seconds and try again.\n\n**Tip:** Consider upgrading your API plan for higher limits.`;
  }
  
  // Authentication errors
  if (statusCode === 401 || statusCode === 403 || message.includes('401') || message.includes('403') || message.includes('INVALID_API_KEY')) {
    return `🔑 **Authentication Failed**\n\nYour API key appears to be invalid or expired.\n\n**Please check:**\n• Go to Settings → API Keys\n• Verify your key is correct\n• Generate a new key if needed`;
  }
  
  // Payment required
  if (statusCode === 402 || message.includes('402') || message.includes('billing') || message.includes('quota')) {
    return `💳 **Payment Required**\n\nYour API account needs attention.\n\n**Possible reasons:**\n• Free tier limit reached\n• Billing issue with your account\n• Insufficient credits\n\nPlease check your provider's billing dashboard.`;
  }
  
  // Server errors
  if (statusCode >= 500 || message.includes('500') || message.includes('502') || message.includes('503')) {
    return `🔧 **Server Error**\n\nThe AI provider's servers are experiencing issues.\n\n**What to do:**\n• Wait a few minutes and try again\n• Check the provider's status page\n• Try a different model`;
  }
  
  // Network/Timeout
  if (message.includes('ECONNABORTED') || message.includes('timeout') || message.includes('TIMEOUT') || message.includes('network')) {
    return `🌐 **Connection Timeout**\n\nThe request took too long to complete.\n\n**Please try:**\n• Check your internet connection\n• Try again in a moment\n• Use a different model`;
  }
  
  // No file selected
  if (message.includes('NO_FILE_SELECTED')) {
    return `📁 **No File Selected**\n\nPlease open a file in the editor first before using this operation.`;
  }
  
  // Model not found
  if (message.includes('MODEL_NOT_FOUND')) {
    return `🤖 **Model Not Available**\n\nThe selected model is not available. Please choose a different model from the dropdown.`;
  }
  
  // API Key missing
  if (message.includes('API_KEY_MISSING')) {
    return `🔐 **API Key Required**\n\nPlease add your API key in Settings to use this model.`;
  }
  
  // Default error
  return `❌ **Error**\n\n${message || 'Something went wrong. Please try again.'}`;
};

export function AIPanel() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const operation: OperationType = 'assist';
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('chat');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pythonEnvStatus, setPythonEnvStatus] = useState<{ available: boolean; version?: string } | null>(null);
  const [pythonEnvPreview, setPythonEnvPreview] = useState<PythonEnvInspection | null>(null);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'parsing' | 'patching' | 'validating'>('idle');
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [showPythonLogsModal, setShowPythonLogsModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [sandboxStatus, setSandboxStatus] = useState<{ available: boolean; version?: string; mode: string; pythonPath?: string; runtimePath?: string; error?: string } | null>(null);
  const [sandboxEnvironmentState, setSandboxEnvironmentState] = useState<'checking' | 'installing' | 'ready' | 'failed'>('checking');
  const [sandboxTasks, setSandboxTasks] = useState<SandboxTask[]>([]);
  const [sandboxFilter, setSandboxFilter] = useState<'all' | 'pending_approval' | 'running' | 'completed' | 'failed' | 'canceled'>('all');
  const [selectedSandboxTaskId, setSelectedSandboxTaskId] = useState<string | null>(null);
  const [lastTokenUsage, setLastTokenUsage] = useState<{ prompt: number; completion: number; total: number } | null>(null);
  const [projectSnapshotSummary, setProjectSnapshotSummary] = useState<string>('');
  const hasSentInitialProjectContextRef = useRef(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAIRequestIdRef = useRef<string | null>(null);
  const announcedSandboxSummariesRef = useRef<Set<string>>(new Set());
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const taskLogScrollRef = useRef<HTMLDivElement>(null);
  const sentAttachmentContextRef = useRef<Set<string>>(new Set());
  const sessionAttachmentStoreRef = useRef<Map<string, AttachedFile>>(new Map());

  const {
    selectedModel,
    setSelectedModel,
    availableModels,
    setAvailableModels,
    isGenerating,
    setIsGenerating,
    activeFile,
    openFiles,
    fileTree,
    projectPath,
    projectName,
    setDiffData,
    setCurrentView,
    openFile,
    refreshFileTree,
    updateFileContent,
    saveFile,
    addToast,
  } = useAppStore();

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const createRequestId = () => `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const appendExecutionLog = (message: string) => {
    const stamped = `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${message}`;
    setExecutionLogs(prev => [...prev.slice(-249), stamped]);
  };

  const safeJsonStringify = (value: any, spacing = 2) => {
    try {
      return JSON.stringify(value, null, spacing);
    } catch {
      return '{"error":"Unable to render JSON payload"}';
    }
  };

  const normalizeSandboxTask = (raw: any): SandboxTask => {
    const safeStatus = ['pending_approval', 'queued', 'running', 'completed', 'failed', 'canceled'].includes(raw?.status)
      ? raw.status
      : 'failed';

    return {
      id: String(raw?.id || `sandbox-task-${Date.now()}`),
      title: String(raw?.title || 'Sandbox Task'),
      type: String(raw?.type || 'unknown'),
      status: safeStatus as SandboxTask['status'],
      createdAt: typeof raw?.createdAt === 'string' && raw.createdAt.trim().length > 0 ? raw.createdAt : new Date().toISOString(),
      input: raw?.input && typeof raw.input === 'object' ? raw.input : {},
      logs: Array.isArray(raw?.logs) ? raw.logs.map((log: any) => String(log)) : [],
      result: raw?.result && typeof raw.result === 'object'
        ? {
            summary: raw.result.summary ? String(raw.result.summary) : undefined,
            stdout: raw.result.stdout ? String(raw.result.stdout) : undefined,
            stderr: raw.result.stderr ? String(raw.result.stderr) : undefined,
            artifacts: Array.isArray(raw.result.artifacts) ? raw.result.artifacts.map((artifact: any) => String(artifact)) : undefined,
            durationMs: typeof raw.result.durationMs === 'number' ? raw.result.durationMs : undefined,
            data: raw.result.data && typeof raw.result.data === 'object' ? raw.result.data : undefined,
          }
        : undefined,
    };
  };

  function appendSandboxSummaryMessage(task: SandboxTask) {
    if (!task?.result?.summary) return;
    const message: Message = {
      id: `sandbox-summary-${task.id}`,
      role: 'assistant',
      content: `Executed sandbox task: **${task.title}**. Result: ${task.result.summary}`,
      timestamp: new Date(),
    };
    setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
  }

  // Auto-saves message drafts.
  useEffect(() => {
    const saveDraft = () => {
      if (input.trim() && currentSessionId) {
        localStorage.setItem(`kivode-draft-${currentSessionId}`, input);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      }
    };
    
    const timer = setTimeout(saveDraft, 1000);
    return () => clearTimeout(timer);
  }, [input, currentSessionId]);

  // Restores drafts when loading a session.
  useEffect(() => {
    if (currentSessionId) {
      const savedDraft = localStorage.getItem(`kivode-draft-${currentSessionId}`);
      if (savedDraft && !input.trim()) {
        setInput(savedDraft);
        addToast({
          type: 'info',
          title: 'Draft Restored',
          message: 'Your previous message has been restored',
          duration: 3000
        });
      }
    }
  }, [currentSessionId]);

  const sanitizeRelativePath = (rawPath: string): string | null => {
    const normalizedProject = projectPath?.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalized = rawPath
      .replace(/^file:\/\//i, '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .trim();

    if (!normalized) return null;

    const absoluteWindows = /^[a-zA-Z]:\//.test(normalized);
    const absoluteUnix = normalized.startsWith('/');
    const absoluteUnc = normalized.startsWith('//');
    if ((absoluteWindows || absoluteUnix || absoluteUnc) && normalizedProject) {
      const normalizedLower = normalized.toLowerCase();
      const projectLower = normalizedProject.toLowerCase();
      if (normalizedLower === projectLower) return null;
      if (normalizedLower.startsWith(`${projectLower}/`)) {
        const relative = normalized.slice(normalizedProject.length + 1);
        if (!relative || relative.includes('..')) return null;
        return relative;
      }
      return null;
    }

    if (normalized.startsWith('/') || normalized.includes('..') || /^[a-zA-Z]:\//.test(normalized)) return null;
    return normalized;
  };


  const parseFileBlocks = (content: string): GeneratedProjectFile[] => {
    const files: GeneratedProjectFile[] = [];
    const regex = /```file\s*\npath:\s*([^\n]+)\n(?:language:\s*[^\n]+\n)?content:\s*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const rawPath = (match[1] || '').trim();
      const body = match[2] || '';
      if (rawPath) files.push({ path: rawPath, content: body });
    }
    return files;
  };

  const extractJsonInstruction = (raw: string): any | null => {
    const cleaned = raw.replace(/^\uFEFF/, '').trim();
    if (!cleaned) return null;

    const candidates: string[] = [];
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRegex.exec(cleaned)) !== null) {
      if (fenceMatch[1]?.trim()) candidates.push(fenceMatch[1].trim());
    }

    const collectBalancedCandidate = (openChar: '{' | '[', closeChar: '}' | ']') => {
      let start = -1;
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = 0; i < cleaned.length; i += 1) {
        const ch = cleaned[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === openChar) {
          if (depth === 0 && start === -1) start = i;
          depth += 1;
        } else if (ch === closeChar && depth > 0) {
          depth -= 1;
          if (depth === 0 && start !== -1) {
            candidates.push(cleaned.slice(start, i + 1).trim());
            break;
          }
        }
      }
    };

    collectBalancedCandidate('{', '}');
    collectBalancedCandidate('[', ']');
    candidates.push(cleaned);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        // try next
      }
    }

    return null;
  };

  const normalizeInstructions = (instructionPayload: any): any[] => {
    if (!instructionPayload) return [];
    if (Array.isArray(instructionPayload)) return instructionPayload;
    if (Array.isArray(instructionPayload.actions)) return instructionPayload.actions;
    return [instructionPayload];
  };

  const createFallbackInstructions = (rawOutput: string) => {
    const actionMatch = rawOutput.match(/\b(apply_patch|replace_body|open_file|create_file|needs_context)\b/i);
    if (!actionMatch) return [];

    const patchBlock = rawOutput.match(/```diff\s*([\s\S]*?)```/i)?.[1]?.trim();
    const fileMatch = rawOutput.match(/(?:file|path)\s*[:=]\s*([^\s\n`]+)/i);
    const normalizedPath = fileMatch?.[1] ? sanitizeRelativePath(fileMatch[1]) : null;

    if (patchBlock && normalizedPath) {
      return [{ action: 'apply_patch', file: normalizedPath, patch: patchBlock }];
    }

    return [{
      action: 'needs_context',
      reason: 'Model produced narrative output instead of structured actions. Please restate the exact file and target function.',
    }];
  };

  const isAttachmentEditRequest = (text: string) => {
    const normalized = text.toLowerCase();
    return /(edit|modify|update|rewrite|refactor|fix|change)/i.test(normalized);
  };

  const extractCodeContent = (raw: string): string => {
    const fenced = raw.match(/```(?:[\w.+-]+)?\n([\s\S]*?)```/);
    if (fenced?.[1]) return fenced[1].trim();
    return raw.trim();
  };

  const normalizePath = (value: string) => value.replace(/\\/g, '/');

  const isInstructionForActiveFile = (instruction: any, activePath?: string | null) => {
    if (!instruction || !activePath || typeof instruction.file !== 'string') return false;
    const normalizedInstruction = normalizePath(instruction.file);
    const normalizedActive = normalizePath(activePath);
    return normalizedInstruction === normalizedActive || normalizedActive.endsWith(`/${normalizedInstruction}`);
  };

  const getEditedSnippetSummary = (before: string, after: string): string => {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const max = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < max; i++) {
      if ((beforeLines[i] ?? '') !== (afterLines[i] ?? '')) {
        const start = Math.max(0, i - 1);
        const end = Math.min(afterLines.length, i + 3);
        return afterLines.slice(start, end).join('\n');
      }
    }
    return afterLines.slice(0, 4).join('\n');
  };

  const calculateChangedLineRatio = (before: string, after: string): number => {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const max = Math.max(beforeLines.length, afterLines.length);
    if (max === 0) return 0;

    let changed = 0;
    for (let i = 0; i < max; i++) {
      if ((beforeLines[i] ?? '') !== (afterLines[i] ?? '')) changed += 1;
    }

    return changed / max;
  };

  const isOverlyBroadEdit = (instruction: any, before: string, after: string): boolean => {
    if (!instruction || instruction.action !== 'replace_body') return false;
    if (before === after) return false;
    const ratio = calculateChangedLineRatio(before, after);
    return ratio > 0.7;
  };


  const streamDiffIntoViewer = async (before: string, after: string, filePath: string) => {
    setCurrentView('diff');
    setDiffData({ original: before, modified: after, filePath });
  };

  const isLikelyExistingFileEditRequest = (text: string): boolean => {
    const t = text.toLowerCase();
    const editTerms = /(edit|modify|update|change|fix|refactor|translate|localize|patch)/;
    const fileAnchor = /(in\s+file|inside\s+file|same\s+file|current\s+file|existing\s+file)/;
    return editTerms.test(t) && fileAnchor.test(t);
  };

  const isCreateFileRequest = (text: string): boolean => {
    const t = text.toLowerCase();
    if (isLikelyExistingFileEditRequest(text)) return false;

    const explicitCreate = /(create|generate|scaffold|bootstrap|start)\s+.*\b(new\s+)?(file|module|component|page|readme|license)\b/.test(t)
      || /(add|write)\s+.*\b(new\s+file|new\s+module|new\s+component)\b/.test(t);

    const explicitCreateAr = /(create|generate)\s+.*(file|new\s+file|readme|license)/i.test(text)
      || /(add)\s+.*(new\s+file)/i.test(text);

    return explicitCreate || explicitCreateAr;
  };

  const shouldForceEditIntent = (text: string, activePath?: string | null): boolean => {
    const t = text.toLowerCase();
    if (isLikelyExistingFileEditRequest(text)) return true;

    const directEditVerb = /(fix|refactor|edit|modify|patch|update|change|rename|translate|localize)/.test(t);
    if (activePath && directEditVerb) return true;

    const mentionsCodeTarget = /(function|method|class|variable|line|lines|diff|patch|translation\s+key)/.test(t);
    return directEditVerb && mentionsCodeTarget;
  };


  const isConsultativeQuestion = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    if (!t) return false;
    const questionShape = /[?]\s*$/.test(t)
      || /^(what|why|how|where|which|can\s+you|could\s+you)\b/i.test(text.trim());
    const explicitEdit = /(create|modify|edit|patch|update|implement|apply)/i.test(text);
    return questionShape && !explicitEdit;
  };

  const isGreetingMessage = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    if (!t) return false;
    const greetingRegex = /^(hi|hello|hey|yo|good\s+(morning|afternoon|evening))[!.,\s]*$/i;
    return greetingRegex.test(text.trim());
  };

  const inferUserIntentHeuristic = (text: string): 'edit' | 'chat' => {
    const trimmed = text.trim();
    if (!trimmed) return 'chat';

    if (isGreetingMessage(trimmed)) return 'chat';

    if (isCreateFileRequest(trimmed)) return 'edit';

    const questionLike = /[?]\s*$/.test(trimmed)
      || /^(what|why|how|where|when|which|who|can\s+you\s+explain)\b/i.test(trimmed);

    // Language-agnostic bias: imperative/non-question requests in code workspace are usually edit intents.
    return questionLike ? 'chat' : 'edit';
  };

  const inferUserIntentByModel = async (
    text: string,
    context: {
      activeFileData?: any | null;
      conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    }
  ): Promise<'edit' | 'chat'> => {
    if (isGreetingMessage(text)) {
      appendExecutionLog('Intent planner shortcut: greeting detected -> chat');
      return 'chat';
    }

    const heuristic = inferUserIntentHeuristic(text);
    try {
      const classifierPrompt = `Classify the user intent for a coding assistant.

User request:
${text}

Rules:
- intent=edit if user asks to add/remove/update/modify/refactor/fix/rename/translate anything in code/files (including UI text and locale keys).
- intent=chat only for questions, explanation, analysis, summaries, or discussions that do not request file changes.
- Imperative requests (e.g., remove version text, add translation key, update license text) are edit.
- Return strict JSON only: {"intent":"edit"|"chat","reason":"..."}`;

      const classification = await window.electronAPI.ai.reviewCode({
        model: selectedModel,
        prompt: classifierPrompt,
        systemPrompt: getProviderStrictJsonPrompt(selectedModel, 'classifier'),
        temperature: 0,
        maxTokens: 120,
        currentFile: context.activeFileData
          ? {
              path: context.activeFileData.path,
              content: String(context.activeFileData.content || '').slice(0, 1200),
              name: context.activeFileData.name,
            }
          : null,
        conversationHistory: (context.conversationHistory || []).slice(-6),
        operation: 'review',
      });

      const payload = extractJsonInstruction(classification.content);
      const parsedIntent = typeof payload?.intent === 'string' ? payload.intent.toLowerCase() : '';
      if (parsedIntent === 'edit' || parsedIntent === 'chat') {
        const forcedEdit = shouldForceEditIntent(text, context.activeFileData?.path);
        const finalIntent = parsedIntent === 'chat' && forcedEdit ? 'edit' : parsedIntent;
        if (finalIntent !== parsedIntent) {
          appendExecutionLog('Intent planner override: forcing edit due to explicit modification request');
        }
        appendExecutionLog(`Intent planner: ${finalIntent} (${payload.reason || 'no reason'})`);
        return finalIntent;
      }
    } catch (error: any) {
      appendExecutionLog(`Intent planner fallback (heuristic): ${error?.message || 'unknown error'}`);
    }

    appendExecutionLog(`Intent planner fallback result: ${heuristic}`);
    return heuristic;
  };

  const parseProjectFilesFromResponse = (content: string): GeneratedProjectFile[] => {
    const files: GeneratedProjectFile[] = [];

    // 1) JSON contract (preferred)
    const jsonCandidates: string[] = [];
    const trimmed = content.trim();
    jsonCandidates.push(trimmed);

    const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedJson?.[1]) jsonCandidates.push(fencedJson[1].trim());

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonCandidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of jsonCandidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed?.files)) {
          for (const f of parsed.files) {
            if (typeof f?.path === 'string' && typeof f?.content === 'string') {
              files.push({ path: f.path, content: f.content });
            }
          }
        }
        if (files.length > 0) break;
      } catch {
        // continue with next candidate or fallback parser
      }
    }

    if (files.length > 0) return files;

    const fileBlocks = parseFileBlocks(content);
    if (fileBlocks.length > 0) return fileBlocks;

    // 2) Markdown fenced blocks fallback
    const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const firstLine = (match[1] || '').trim();
      const body = match[2] ?? '';
      if (!firstLine) continue;

      // Accept when fence label appears to be a path (contains slash or a dot-based filename)
      const looksLikePath = /[\/]/.test(firstLine) || /^[\w.-]+\.[\w.-]+$/.test(firstLine);
      if (looksLikePath) {
        files.push({ path: firstLine, content: body });
      }
    }

    return files;
  };

  const streamToEditorFile = async (absolutePath: string, finalContent: string) => {
    const chunkSize = 120;
    let cursor = 0;
    while (cursor < finalContent.length) {
      cursor = Math.min(finalContent.length, cursor + chunkSize);
      updateFileContent(absolutePath, finalContent.slice(0, cursor));
      await delay(8);
    }
  };

  const createProjectFilesInEditor = async (rawContent: string) => {
    if (!projectPath) {
      throw new Error('Open or create a project folder first before generating files.');
    }

    const files = parseProjectFilesFromResponse(rawContent)
      .map(file => ({
        ...file,
        path: sanitizeRelativePath(file.path),
      }))
      .filter((file): file is { path: string; content: string } => Boolean(file.path));

    if (files.length === 0) {
      throw new Error('No project files were detected in AI response. Ask AI to return structured files.');
    }

    setCurrentView('editor');

    for (const file of files) {
      const relativePath = file.path;
      const absolutePath = `${projectPath}/${relativePath}`.replace(/\/+/g, '/');
      const lastSlash = absolutePath.lastIndexOf('/');
      const dirPath = lastSlash > -1 ? absolutePath.slice(0, lastSlash) : projectPath;
      const fileName = relativePath.split('/').pop() || 'new-file.txt';

      await window.electronAPI.file.createDirectory(dirPath);
      await window.electronAPI.file.writeFile(absolutePath, '');

      await refreshFileTree();
      await openFile({
        name: fileName,
        path: absolutePath,
        type: 'file',
      } as any);

      await streamToEditorFile(absolutePath, file.content);
      await saveFile(absolutePath);
    }

    await refreshFileTree();
    addToast({
      type: 'success',
      title: 'Project Files Generated',
      message: `${files.length} files were created and streamed into the editor.`,
    });

    return files.length;
  };


  useEffect(() => {
    let mounted = true;
    const aiApi = window.electronAPI?.ai;
    if (!aiApi || typeof aiApi.getPythonEnvStatus !== 'function') {
      setPythonEnvStatus({ available: false });
      appendExecutionLog('Python env status unavailable: electron bridge is not ready.');
      return () => {
        mounted = false;
      };
    }

    aiApi.getPythonEnvStatus()
      .then((status) => {
        if (mounted) setPythonEnvStatus(status);
      })
      .catch(() => {
        if (mounted) setPythonEnvStatus({ available: false });
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSandbox = async () => {
      const sandboxApi = window.electronAPI?.sandbox;
      if (!sandboxApi) {
        if (mounted) {
          setSandboxEnvironmentState('failed');
          setSandboxStatus({ available: false, mode: 'sandboxed', error: 'Sandbox API bridge unavailable' });
          appendExecutionLog('Sandbox API unavailable: electron bridge is not ready.');
        }
        return;
      }

      try {
        if (!mounted) return;
        setSandboxEnvironmentState('installing');
        await sandboxApi.ensureEnvironment(false);
        if (!mounted) return;
        setSandboxEnvironmentState('ready');
      } catch (error: any) {
        if (!mounted) return;
        setSandboxEnvironmentState('failed');
        appendExecutionLog(`Sandbox environment error: ${error?.message || 'unknown error'}`);
      }

      try {
        const status = await sandboxApi.indexStatus();
        if (mounted) setSandboxStatus(status);
      } catch {
        if (mounted) setSandboxStatus({ available: false, mode: 'sandboxed', error: 'Sandbox status unavailable' });
      }
    };

    loadSandbox();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSandboxTasks = useCallback(async () => {
    const sandboxApi = window.electronAPI?.sandbox;
    if (!sandboxApi || typeof sandboxApi.listSessionTasks !== 'function') {
      setSandboxTasks([]);
      return;
    }

    try {
      const tasks = await sandboxApi.listSessionTasks();
      const normalizedTasks = Array.isArray(tasks) ? tasks.map(normalizeSandboxTask) : [];
      setSandboxTasks(normalizedTasks);
      setSelectedSandboxTaskId((prev) => {
        if (prev && normalizedTasks.some((t: SandboxTask) => t.id === prev)) return prev;
        return normalizedTasks.length ? normalizedTasks[0].id : null;
      });
    } catch (error: any) {
      appendExecutionLog(`Sandbox refresh error: ${error?.message || 'unknown error'}`);
    }
  }, []);

  useEffect(() => {
    if (!showPythonLogsModal) return;
    refreshSandboxTasks();
    const timer = setInterval(() => {
      refreshSandboxTasks().catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [showPythonLogsModal, refreshSandboxTasks]);

  useEffect(() => {
    if (!showPythonLogsModal) return;
    const visible = sandboxTasks.filter((task) => sandboxFilter === 'all' || task.status === sandboxFilter);
    if (visible.length === 0) {
      if (selectedSandboxTaskId !== null) {
        setSelectedSandboxTaskId(null);
      }
      return;
    }

    if (!selectedSandboxTaskId || !visible.some((task) => task.id === selectedSandboxTaskId)) {
      setSelectedSandboxTaskId(visible[0].id);
    }
  }, [showPythonLogsModal, sandboxTasks, sandboxFilter, selectedSandboxTaskId]);

  useEffect(() => {
    for (const task of sandboxTasks) {
      if (!['completed', 'failed'].includes(task.status)) continue;
      if (announcedSandboxSummariesRef.current.has(task.id)) continue;
      announcedSandboxSummariesRef.current.add(task.id);
      appendSandboxSummaryMessage(task);
    }
  }, [sandboxTasks]);

  useEffect(() => {
    if (!showPythonLogsModal) return;

    const refs = [timelineScrollRef, taskLogScrollRef];
    for (const ref of refs) {
      const node = ref.current;
      if (!node) continue;
      const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
      if (nearBottom) {
        node.scrollTop = node.scrollHeight;
      }
    }
  }, [executionLogs, sandboxTasks, showPythonLogsModal]);

  const buildPythonContext = (inspection: PythonEnvInspection) => {
    if (!inspection.ok) return '';
    const matchSummary = (inspection.matches || [])
      .map((m, idx) => {
        const snippets = (m.snippets || [])
          .slice(0, 2)
          .map((snippet) => `  - L${snippet.line}: ${snippet.snippet.replace(/\n/g, ' ').slice(0, 180)}`)
          .join('\n');
        return `${idx + 1}. ${m.path} (score ${m.score})\\n${snippets}`;
      })
      .join('\n');

    const contextPreview = (inspection.contextFiles || [])
      .slice(0, 2)
      .map((file, idx) => `${idx + 1}. ${file.path}\n${file.excerpt.slice(0, 220).replace(/\n/g, '\\n')}`)
      .join('\\n\\n');

    return `Python Local Context:\\nTree:\\n${(inspection.tree || []).slice(0, 24).join('\\n')}\\n\\nMatches:\\n${matchSummary || 'No direct matches.'}\\n\\nContext Files:\\n${contextPreview || 'No context file excerpts.'}`;
  };

  const inspectPromptWithPython = async (promptText: string): Promise<string> => {
    if (!projectPath || !pythonEnvStatus?.available) return '';
    const inspection = await window.electronAPI.ai.inspectWithPythonEnv(projectPath, promptText);
    setPythonEnvPreview(inspection);
    return buildPythonContext(inspection);
  };

  const buildProjectSnapshot = (index: any[] = []) => {
    const allFiles = index.slice(0, 1200);
    const fileList = allFiles.map((item) => `- ${item.path}`).join('\n');
    const allFunctions = allFiles
      .flatMap((item) => (item?.symbols?.functions || []).map((fn: any) => `${item.path}:${fn.name} [${fn.line_start}-${fn.line_end}]`));
    const allClasses = allFiles
      .flatMap((item) => (item?.symbols?.classes || []).map((cl: any) => `${item.path}:${cl.name} [${cl.line_start}-${cl.line_end}]`));

    const payload = `Project Snapshot (Local Python Engine)
Total indexed files: ${allFiles.length}
Files:
${fileList || 'None'}

Indexed Functions:
${allFunctions.join('\n') || 'None'}

Indexed Classes:
${allClasses.join('\n') || 'None'}`;
    return payload.slice(0, 120000);
  };

  const fetchInitialProjectSnapshot = async (): Promise<string> => {
    if (!projectPath || !pythonEnvStatus?.available) return '';
    const result = await window.electronAPI.ai.pythonExecute(projectPath, { action: 'analyze_project' });
    if (!result?.ok) return '';
    const summary = buildProjectSnapshot(result.index || []);
    setProjectSnapshotSummary(summary);
    return summary;
  };

  useEffect(() => {
    if (!projectPath || !pythonEnvStatus?.available) return;

    let cancelled = false;
    const runInitialIndexing = async () => {
      try {
        setExecutionStatus('parsing');
        appendExecutionLog('Python brain: indexing project files...');
        const snapshot = await fetchInitialProjectSnapshot();
        if (!cancelled && snapshot) {
          appendExecutionLog(`Python brain: project index is ready (${(snapshot.match(/^- /gm) || []).length} files summarized)`);
        }
      } catch {
        if (!cancelled) {
          appendExecutionLog('Python brain: failed to index project');
        }
      } finally {
        if (!cancelled) setExecutionStatus('idle');
      }
    };

    runInitialIndexing();
    return () => {
      cancelled = true;
    };
  }, [projectPath, pythonEnvStatus?.available]);

  const openProjectFileInEditor = async (absolutePath: string, contentHint?: string) => {
    try {
      await openFile({
        name: absolutePath.split(/[\/]/).pop() || absolutePath,
        path: absolutePath,
        type: 'file',
      } as any);
    } catch {
      // editor open is best-effort
    }

    try {
      const content = typeof contentHint === 'string'
        ? contentHint
        : await window.electronAPI.file.readFile(absolutePath);
      return {
        path: absolutePath,
        name: absolutePath.split(/[\/]/).pop() || absolutePath,
        content,
      };
    } catch {
      return null;
    }
  };

  const openProjectFileByRelativePath = async (relativePath: string) => {
    if (!projectPath) return null;
    const safeRel = sanitizeRelativePath(relativePath);
    if (!safeRel) return null;
    const absolutePath = `${projectPath}/${safeRel}`.replace(/\/+/g, '/');
    return openProjectFileInEditor(absolutePath);
  };

  const flattenProjectFileTree = (nodes: any[]): string[] => {
    const out: string[] = [];
    const walk = (items: any[]) => {
      for (const item of items || []) {
        if (!item) continue;
        if (item.type === 'file' && typeof item.path === 'string') {
          out.push(toRelativeModelPath(item.path));
        }
        if (Array.isArray(item.children)) walk(item.children);
      }
    };
    walk(nodes || []);
    return out;
  };

  const planTargetFilesForModify = async (promptText: string, candidates: Array<{ path: string }>): Promise<string[]> => {
    if (!candidates.length) return [];
    const shortList = candidates.slice(0, 40);

    const plannerPrompt = `Pick target files for this edit task. File selection must be model-driven, not python-driven.

User request:
${promptText}

Candidate files:
${shortList.map((c, i) => `${i + 1}. ${c.path}`).join('\n')}

Rules:
- Return 1-10 files max.
- Select only directly relevant files.
- Return strict JSON only with schema: {"paths":["relative/path1","relative/path2"],"reason":"..."}`;

    try {
      const plan = await window.electronAPI.ai.reviewCode({
        model: selectedModel,
        prompt: plannerPrompt,
        systemPrompt: getProviderStrictJsonPrompt(selectedModel, 'planner'),
        temperature: 0,
        maxTokens: 280,
        operation: 'review',
      });
      const payload = extractJsonInstruction(plan.content);
      const selected = (Array.isArray(payload?.paths) ? payload.paths : [])
        .map((p: string) => sanitizeRelativePath(p))
        .filter((p: string | null): p is string => Boolean(p))
        .filter((p: string) => shortList.some((c) => c.path === p))
        .slice(0, 10);

      if (selected.length) {
        appendExecutionLog(`AI target planner selected files: ${selected.join(', ')}`);
        return selected;
      }
    } catch (error: any) {
      appendExecutionLog(`AI target planner fallback: ${error?.message || 'unknown error'}`);
    }

    return shortList.slice(0, 2).map((c) => c.path);
  };

  const resolveTargetFilesForModify = async (promptText: string) => {
    if (!projectPath) return [] as any[];
    const fileCandidates = flattenProjectFileTree(fileTree || [])
      .filter((item) => !item.startsWith('.kivode/'))
      .map((path) => ({ path }));

    if (!fileCandidates.length) return [] as any[];

    const selectedPaths = await planTargetFilesForModify(promptText, fileCandidates);
    const openedTargets: any[] = [];

    for (const relPath of selectedPaths) {
      const opened = await openProjectFileByRelativePath(relPath);
      if (opened) openedTargets.push({ ...opened, autoSelected: true, relativePath: relPath });
    }

    if (openedTargets.length > 0) {
      appendExecutionLog(`Auto-opened ${openedTargets.length} AI-targeted file(s): ${openedTargets.map((f) => toRelativeModelPath(f.path)).join(', ')}`);
    }

    return openedTargets;
  };

  const toRelativeModelPath = (absoluteOrRelative: string) => {
    if (!projectPath) return absoluteOrRelative;
    const normalizedProject = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedPath = absoluteOrRelative.replace(/\\/g, '/');
    if (normalizedPath.startsWith(`${normalizedProject}/`)) {
      return normalizedPath.slice(normalizedProject.length + 1);
    }
    return normalizedPath;
  };

  const buildContextFilesForRequest = async (
    promptText: string,
    activeFileData: any | null,
    pendingAttachments: AttachedFile[],
    intent: 'edit' | 'chat',
    preselectedTargets: any[] = []
  ) => {
    const collected = new Map<string, { path: string; content: string }>();
    const addFile = (path: string, content: string, keepFull = false, treatAsAttachment = false) => {
      if (!path || !content || collected.has(path)) return;
      const normalizedPath = treatAsAttachment
        ? `attachment/${path.replace(/^attachment\//, '')}`
        : toRelativeModelPath(path);
      collected.set(path, { path: normalizedPath, content: keepFull ? content : content.slice(0, 1800) });
    };

    if (activeFileData?.path && typeof activeFileData.content === 'string') {
      addFile(activeFileData.path, activeFileData.content);
    }

    for (const target of preselectedTargets.slice(0, 10)) {
      if (target?.path && typeof target.content === 'string') {
        addFile(target.path, target.content);
      }
    }

    if (projectPath && pythonEnvStatus?.available) {
      const searchResult = await window.electronAPI.ai.pythonExecute(projectPath, {
        action: 'smart_search',
        query: promptText,
        mode: 'keyword',
        limit: 8,
      });

      if (searchResult?.ok && Array.isArray(searchResult.results)) {
        for (const item of searchResult.results.slice(0, 5)) {
          if (!item?.path) continue;
          const absolutePath = `${projectPath}/${item.path}`.replace(/\/+/g, '/');

          if (intent === 'edit' && Array.isArray(item.matches) && item.matches.length > 0) {
            const focusedSnippet = item.matches
              .slice(0, 3)
              .map((m: any) => `L${m.line}: ${String(m.text || '').slice(0, 260)}`)
              .join('\n');
            addFile(absolutePath, `Focused matches for edit request in ${item.path}:\n${focusedSnippet}`);
            continue;
          }

          try {
            const content = await window.electronAPI.file.readFile(absolutePath);
            addFile(absolutePath, content);
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    if (projectPath) {
      const priorityFiles = ['README.md', 'package.json', 'tsconfig.json', 'requirements.txt', 'pyproject.toml'];
      for (const rel of priorityFiles) {
        if (collected.size >= 6) break;
        const absolutePath = `${projectPath}/${rel}`.replace(/\/+/g, '/');
        try {
          const content = await window.electronAPI.file.readFile(absolutePath);
          addFile(absolutePath, content);
        } catch {
          // optional
        }
      }
    }

    for (const attached of pendingAttachments.slice(0, 4)) {
      if (attached.content?.trim()) {
        const summary = attached.summary;
        const attachmentEnvelope = [
          `Attachment metadata (indexed by python):`,
          `- name: ${attached.name}`,
          `- size_bytes: ${attached.size}`,
          `- mime_type: ${attached.mimeType}`,
          `- encoding: ${attached.encoding}`,
          summary ? `- summary_chars: ${summary.chars}` : '- summary_chars: unknown',
          summary ? `- summary_lines: ${summary.lines}` : '- summary_lines: unknown',
          summary ? `- summary_functions: ${summary.functions}` : '- summary_functions: unknown',
          summary ? `- summary_classes: ${summary.classes}` : '- summary_classes: unknown',
          `- preview:`,
          (summary?.preview || '').slice(0, 2500),
          `- retrieval_hint: request open_file with path attachment/${attached.name} if full content is needed.`,
        ].join('\n');
        addFile(attached.name, attachmentEnvelope, true, true);
      }
    }

    return Array.from(collected.values()).slice(0, 10);
  };

  const streamAssistantMessage = async (baseMessages: Message[], content: string, operationType: OperationType) => {
    const assistantId = `assistant-${Date.now()}`;
    const chunks = content.match(/[\s\S]{1,32}/g) || [];
    let current = '';

    for (const chunk of chunks) {
      current += chunk;
      const partialMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: current,
        timestamp: new Date(),
        type: operationType,
        files: [],
      };
      setMessages([...baseMessages, partialMessage]);
      await delay(24);
    }

    const finalMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content,
      timestamp: new Date(),
      type: operationType,
      files: [],
    };

    return [...baseMessages, finalMessage];
  };

  const streamChatFromProvider = async (baseMessages: Message[], requestParams: any) => {
    const assistantId = `assistant-${Date.now()}`;
    const assistantTimestamp = new Date();
    let streamedContent = '';
    let usage: { prompt: number; completion: number; total: number } | null = null;

    const pushPartial = () => {
      const partialMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: streamedContent,
        timestamp: assistantTimestamp,
        type: operation,
        files: [],
      };
      setMessages([...baseMessages, partialMessage]);
    };

    pushPartial();

    const requestId = currentAIRequestIdRef.current || createRequestId();
    currentAIRequestIdRef.current = requestId;

    await new Promise<void>(async (resolve, reject) => {
      const unsubscribe = window.electronAPI.ai.onChatStreamEvent((evt: any) => {
        if (!evt || evt.requestId !== requestId) return;

        if (evt.type === 'delta' && typeof evt.delta === 'string') {
          streamedContent += evt.delta;
          pushPartial();
          return;
        }

        if (evt.type === 'usage' && evt.usage) {
          usage = {
            prompt: evt.usage.promptTokens || 0,
            completion: evt.usage.completionTokens || 0,
            total: evt.usage.totalTokens || 0,
          };
          return;
        }

        if (evt.type === 'error') {
          unsubscribe();
          reject(new Error(evt.error || 'Streaming failed'));
          return;
        }

        if (evt.type === 'done') {
          if (typeof evt.content === 'string' && evt.content.length >= streamedContent.length) {
            streamedContent = evt.content;
            pushPartial();
          }
          unsubscribe();
          resolve();
        }
      });

      try {
        await window.electronAPI.ai.startChatStream({
          ...requestParams,
          requestId,
          prompt: requestParams.prompt,
          operation: 'explain',
        });
      } catch (error) {
        unsubscribe();
        reject(error);
      }
    });

    const finalMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: streamedContent,
      timestamp: assistantTimestamp,
      type: operation,
      files: [],
    };

    const finalMessages = [...baseMessages, finalMessage];
    setMessages(finalMessages);
    if (usage) {
      setLastTokenUsage(usage);
    }

    return { finalMessages, content: streamedContent };
  };

  const isLikelyNewFileRequest = (text: string): boolean => {
    const normalized = text.toLowerCase();
    return /\b(create|new|add|generate)\b.*\b(file|readme|md|json|ts|tsx|js|py)\b/.test(normalized)
      || /\b(new file|create file|add file)\b/i.test(text);
  };


  const applyAssistantFiles = async (rawContent: string) => {
    if (!projectPath) return 0;
    const files = parseProjectFilesFromResponse(rawContent)
      .map((file) => ({ ...file, path: sanitizeRelativePath(file.path) }))
      .filter((file): file is { path: string; content: string } => Boolean(file.path));

    if (files.length === 0) return 0;

    for (const file of files) {
      const absolutePath = `${projectPath}/${file.path}`.replace(/\/+/g, '/');
      const directory = absolutePath.includes('/') ? absolutePath.slice(0, absolutePath.lastIndexOf('/')) : projectPath;
      await window.electronAPI.file.createDirectory(directory);
      await window.electronAPI.file.writeFile(absolutePath, file.content);
      await refreshFileTree();
    }

    return files.length;
  };

  const repairAssistantFiles = async (rawContent: string, originalRequest: string): Promise<number> => {
    if (!projectPath || !rawContent.trim()) return 0;

    try {
      const repaired = await window.electronAPI.ai.reviewCode({
        model: selectedModel,
        prompt: `Convert the following assistant output into strict JSON files payload.

User request:
${originalRequest}

Assistant output:
${rawContent}

Required output schema:
{"files":[{"path":"relative/path.ext","content":"full file content"}]}

Rules:
- Include only files that should be created/updated for the user request.
- Use relative paths only.
- Do not include markdown or explanation.`,
        systemPrompt: getProviderStrictJsonPrompt(selectedModel, 'file_repair'),
        temperature: 0,
        maxTokens: 4000,
        operation: 'review',
      });

      return await applyAssistantFiles(repaired.content || '');
    } catch {
      return 0;
    }
  };

  // UI model options are loaded from the main process.
  // Local fallback models are used only if loading fails.
  useEffect(() => {
    if (availableModels.length === 0) {
      setAvailableModels(AVAILABLE_MODELS);
    }
  }, [availableModels.length, setAvailableModels]);

  // Loads sessions from localStorage.
  useEffect(() => {
    const loadSessions = () => {
      try {
        const saved = localStorage.getItem('kivode-chat-sessions');
        if (saved) {
          const parsed = JSON.parse(saved);
          setChatSessions(parsed.map((session: any) => ({
            ...session,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
            messages: session.messages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp)
            }))
          })));
        }
      } catch (error) {
        console.error('Failed to load chat sessions:', error);
      }
    };
    loadSessions();
  }, []);

  // Persists sessions.
  const saveSessions = useCallback((sessions: ChatSession[]) => {
    try {
      localStorage.setItem('kivode-chat-sessions', JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }, []);

  // Creates a session only when the user actually starts messaging.
  const createSession = useCallback(async (): Promise<string> => {
    const sessionId = Date.now().toString();
    await fetchInitialProjectSnapshot();
    
    const newSession: ChatSession = {
      id: sessionId,
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      projectContext: {
        path: projectPath || null,
        fileTree: fileTree || [],
        openFiles: openFiles.map((f: any) => f.path)
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setCurrentSessionId(sessionId);
    setMessages([]);
    setChatSessions(prev => {
      const updated = [newSession, ...prev].slice(0, 50);
      saveSessions(updated);
      return updated;
    });
    return sessionId;
  }, [projectPath, fileTree, openFiles, saveSessions, fetchInitialProjectSnapshot]);

  const maybeGenerateSessionTitle = useCallback(async (sessionId: string, conversation: Message[]) => {
    const userMessageCount = conversation.filter((msg) => msg.role === 'user').length;
    if (userMessageCount < MIN_USER_MESSAGES_FOR_TITLE) {
      return;
    }

    const titleContext = conversation
      .slice(0, TITLE_SOURCE_MESSAGE_LIMIT)
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const projectHint = projectName ? `Project name: ${projectName}` : 'Project name: none';

    try {
      const result = await window.electronAPI.ai.reviewCode({
        model: selectedModel,
        prompt: `Generate a professional and concise chat title based on the current topic.
- Output JSON only with schema: {"title":"..."}
- Maximum 6 words.
- Do not copy the first user message literally.
- If a project analysis is requested, include project name when available.

${projectHint}
Conversation snippet:
${titleContext}`,
        systemPrompt: 'You are a chat title generator. Return strict JSON only.',
        temperature: 0.2,
        maxTokens: 60,
        operation: 'review',
      });

      const parsed = extractJsonInstruction(result?.content || '');
      const candidate = String(parsed?.title || '').trim();
      if (!candidate) return;

      setChatSessions((prev) => {
        let changed = false;
        const updated = prev.map((entry) => {
          if (entry.id !== sessionId || entry.title !== DEFAULT_CHAT_TITLE) return entry;
          changed = true;
          return { ...entry, title: candidate, updatedAt: new Date() };
        });
        if (changed) {
          saveSessions(updated);
        }
        return updated;
      });
    } catch {
      // Keep default title if generation fails.
    }
  }, [projectName, saveSessions, selectedModel]);

  // Auto-scroll follows responses only when the user is near the bottom.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 56;
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: isGenerating ? 'auto' : 'smooth' });
  }, [messages, isGenerating]);

  // Adjusts textarea height.
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Closes the model list when clicking outside.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K opens shortcut help.
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowShortcuts(true);
      }
      
      // Escape closes open overlays.
      if (e.key === 'Escape') {
        setShowModelMenu(false);
        setShowHistory(false);
        setShowShortcuts(false);
        setShowAttachMenu(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Starts a new chat.
  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setShowHistory(false);
    setInput('');
    setAttachedFiles([]);
    sentAttachmentContextRef.current.clear();
    sessionAttachmentStoreRef.current.clear();
  };

  // Loads an existing session.
  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setShowHistory(false);
    sentAttachmentContextRef.current.clear();
    sessionAttachmentStoreRef.current.clear();
  };

  // Deletes a session.
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = chatSessions.filter(s => s.id !== sessionId);
    setChatSessions(updated);
    saveSessions(updated);
    
    if (currentSessionId === sessionId) {
      startNewChat();
    }
  };

  // Cancels in-flight requests.
  const handleCancel = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const requestId = currentAIRequestIdRef.current;
    if (requestId) {
      try {
        await window.electronAPI.ai.cancelRequest(requestId);
        appendExecutionLog(`Cancellation propagated to provider request: ${requestId}`);
      } catch {
        appendExecutionLog('Cancellation warning: failed to propagate request cancel to backend');
      }
      currentAIRequestIdRef.current = null;
    }

    setIsGenerating(false);
    addToast({
      type: 'info',
      title: 'Cancelled',
      message: 'AI generation was cancelled',
      duration: 2000
    });
  };

  const regenerateFromAssistantMessage = async (assistantMessageId: string) => {
    const assistantIndex = messages.findIndex((m) => m.id === assistantMessageId && m.role === 'assistant');
    if (assistantIndex < 0) return;

    let userIndex = -1;
    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        userIndex = i;
        break;
      }
    }
    if (userIndex < 0) return;

    const baseMessages = messages.slice(0, userIndex);
    const targetUserMessage = messages[userIndex];
    await handleSend({ promptOverride: targetUserMessage.content, baseMessagesOverride: baseMessages, clearComposer: true });
  };

  const beginEditUserMessage = (message: Message) => {
    if (message.role !== 'user') return;
    setEditingMessageId(message.id);
    setInput(message.content);
    textareaRef.current?.focus();
  };

  // Handles file uploads.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
  };

  const readBrowserFilePayload = (file: File): Promise<{ content: string; encoding: 'utf-8' | 'base64' }> => {
    return new Promise((resolve, reject) => {
      const textReader = new FileReader();
      textReader.onload = () => {
        const text = String(textReader.result || '');
        if (text.includes('\u0000')) {
          const binReader = new FileReader();
          binReader.onload = () => {
            const raw = String(binReader.result || '');
            const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
            resolve({ content: base64, encoding: 'base64' });
          };
          binReader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          binReader.readAsDataURL(file);
          return;
        }

        resolve({ content: text, encoding: 'utf-8' });
      };
      textReader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      textReader.readAsText(file);
    });
  };

  const decodeAttachmentText = (attached: AttachedFile) => {
    if (attached.encoding === 'utf-8') return attached.content;
    try {
      const binary = atob(attached.content);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  };

  const prepareAttachmentForModel = (attached: AttachedFile): AttachedFile => {
    const text = decodeAttachmentText(attached);
    return {
      ...attached,
      content: text,
      encoding: 'utf-8',
    };
  };

  const processFiles = async (files: File[]) => {
    const validFiles = files.filter((f) => {
      const mime = String(f.type || '').toLowerCase();
      if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) return false;
      return true;
    });

    if (validFiles.length === 0) {
      addToast({
        type: 'error',
        title: 'Invalid Files',
        message: 'Please attach document/code files only (images/media are not supported).',
        duration: 3000
      });
      return;
    }

    const newFiles: AttachedFile[] = [];
    for (const file of validFiles) {
      try {
        const payload = await readBrowserFilePayload(file);
        newFiles.push({
          name: file.name,
          path: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          encoding: payload.encoding,
          content: payload.content,
        });
      } catch {
        // skip unreadable file
      }
    }

    if (newFiles.length === 0) {
      addToast({
        type: 'error',
        title: 'Attach Failed',
        message: 'Selected files could not be read',
        duration: 3000
      });
      return;
    }

    setAttachedFiles(prev => [...prev, ...newFiles]);
    addToast({
      type: 'success',
      title: 'Files Attached',
      message: `${newFiles.length} file(s) attached`,
      duration: 2000
    });
    setShowAttachMenu(false);
  };

  const summarizeAttachmentsWithPython = async (attachments: AttachedFile[]): Promise<AttachedFile[]> => {
    if (attachments.length === 0) return attachments;

    appendExecutionLog(`Attachment pre-analysis started for ${attachments.length} file(s)...`);
    setExecutionStatus('parsing');

    let pythonRoot = projectPath;
    if (!pythonRoot) {
      try {
        pythonRoot = await window.electronAPI.app.getPath('temp');
      } catch {
        pythonRoot = null;
      }
    }

    const enriched: AttachedFile[] = [];
    for (const attached of attachments) {
      let summary: AttachedFile['summary'] | undefined;
      if (pythonRoot) {
        try {
          const result = await window.electronAPI.ai.pythonExecute(pythonRoot, {
            action: 'summarize_attachment',
            name: attached.name,
            encoding: attached.encoding,
            content: attached.content,
          });
          if (result?.ok && result?.summary) {
            summary = result.summary;
            appendExecutionLog(`Attachment indexed: ${attached.name} (${summary.lines} lines)`);
          }
        } catch {
          // fallback below
        }
      }

      if (!summary) {
        const text = attached.encoding === 'utf-8' ? attached.content : '';
        const lines = text ? text.split('\n') : [];
        summary = {
          chars: text.length,
          lines: lines.length,
          functions: 0,
          classes: 0,
          imports: 0,
          preview: lines.slice(0, 40).join('\n'),
        };
        appendExecutionLog(`Attachment fallback summary used: ${attached.name}`);
      }

      enriched.push({ ...attached, summary });
    }

    appendExecutionLog('Attachment pre-analysis completed. Sending indexed context to model.');
    setExecutionStatus('idle');
    return enriched;
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Sends a message.
  const handleSend = async (options?: { promptOverride?: string; baseMessagesOverride?: Message[]; clearComposer?: boolean }) => {
    const composedPrompt = options?.promptOverride ?? input;
    if (!composedPrompt.trim() || isGenerating) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = await createSession();
    }
    const activeSessionId = sessionId;

    const sourceMessages = options?.baseMessagesOverride
      ?? (editingMessageId
        ? (() => {
            const editIndex = messages.findIndex((m) => m.id === editingMessageId && m.role === 'user');
            return editIndex >= 0 ? messages.slice(0, editIndex) : messages;
          })()
        : messages);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: composedPrompt,
      timestamp: new Date(),
      type: operation,
      files: [...openFiles.map((f: any) => f.path), ...attachedFiles.map(f => `attachment/${f.name}`)]
    };

    const pendingAttachments = attachedFiles;
    const preparedAttachments = pendingAttachments.map((file) => prepareAttachmentForModel(file));
    preparedAttachments.forEach((file) => {
      sessionAttachmentStoreRef.current.set(file.name, file);
    });
    const availableAttachments = Array.from(sessionAttachmentStoreRef.current.values());

    const updatedMessages = [...sourceMessages, userMessage];
    setMessages(updatedMessages);
    if (options?.clearComposer ?? true) {
      setInput('');
    }
    setEditingMessageId(null);
    setAttachedFiles([]);
    setIsGenerating(true);

    // Create an AbortController for cancellation.
    abortControllerRef.current = new AbortController();
    currentAIRequestIdRef.current = createRequestId();

    let pendingTitleSessionId: string | null = null;
    let pendingTitleConversation: Message[] | null = null;

    try {
      const analyzedAttachments = availableAttachments;

      const conversationHistory = updatedMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        files: m.files
      }));

      const createFileIntent = isCreateFileRequest(userMessage.content);
      let activeFileData = openFiles.find((f: any) => f.path === activeFile) as any;
      const attachmentEditIntent = availableAttachments.length > 0 && isAttachmentEditRequest(userMessage.content);
      const finalIntent: 'chat' | 'edit' = assistantMode === 'code' && projectPath ? 'edit' : 'chat';
      const resolvedCreateFileIntent = finalIntent === 'edit' && createFileIntent;

      let plannedTargetFiles: any[] = [];
      if (finalIntent === 'edit' && !resolvedCreateFileIntent && projectPath) {
        plannedTargetFiles = await resolveTargetFilesForModify(userMessage.content);
        if (!activeFileData && plannedTargetFiles.length > 0) {
          activeFileData = plannedTargetFiles[0];
          appendExecutionLog(`Primary target file selected: ${activeFileData.path}`);
        }
      }

      if (activeFileData?.path) {
        try {
          const diskContent = await window.electronAPI.file.readFile(activeFileData.path);
          activeFileData = { ...activeFileData, content: diskContent };
        } catch {
          // keep current buffer fallback
        }
      }

      const pythonContext = await inspectPromptWithPython(userMessage.content);
      appendExecutionLog(`Python context status: ${pythonContext ? 'available' : 'empty'}`);
      const firstRequestProjectContext = !hasSentInitialProjectContextRef.current ? (projectSnapshotSummary || await fetchInitialProjectSnapshot()) : '';
      const initialSnapshot = firstRequestProjectContext;
      const contextFiles = await buildContextFilesForRequest(userMessage.content, activeFileData, availableAttachments, finalIntent, plannedTargetFiles);
      const attachmentContextFiles = analyzedAttachments.flatMap((attached) => {
        const path = `attachment/${attached.name}`;
        const shouldSendAttachmentSnapshot = !sentAttachmentContextRef.current.has(path);

        const filesToSend: Array<{ path: string; content: string }> = [];

        if (shouldSendAttachmentSnapshot) {
          filesToSend.push({
            path: `${path}#full`,
            content: [
              `Attachment file payload:`,
              `- name: ${attached.name}`,
              `- size_bytes: ${attached.size}`,
              `- mime_type: ${attached.mimeType}`,
              `- encoding: utf-8`,
              `- note: full file content is attached below without truncation.`,
              '',
              attached.content,
            ].join('\n')
          });
          sentAttachmentContextRef.current.add(path);
        }

        return filesToSend;
      });

      const mergedContextFiles = [...contextFiles, ...attachmentContextFiles].filter((file, index, arr) =>
        arr.findIndex((x) => x.path === file.path) === index
      );

      const multiFileEditPrompt = finalIntent === 'edit' && plannedTargetFiles.length > 0
        ? `${userMessage.content}

Execution requirements:
- You may modify multiple related files in one run.
- Use strict JSON actions only.
- Include explicit \"file\" for each edit action.
- Continue producing actions until all impacted files are covered.
- Candidate target files: ${plannedTargetFiles.map((f: any) => toRelativeModelPath(f.path)).join(', ')}`
        : userMessage.content;

      const attachmentEditPromptHint = attachmentEditIntent
        ? '\n\nAttachment-edit mode: If user asks to modify attached file(s), return the updated file content inside markdown code block(s) with clear filename headings.'
        : '';

      const requestParams = {
        model: selectedModel,
        prompt: `${multiFileEditPrompt}${attachmentEditPromptHint}`,
        systemPrompt: finalIntent === 'chat'
          ? 'You are Kivode+ AI assistant. Respond naturally in the user language with concise, helpful conversational answers. Do not output JSON unless explicitly asked. If you output any source/file content (including .md), you MUST wrap it in fenced code blocks with the correct language tag (use markdown as language tag for .md).'
          : (resolvedCreateFileIntent
            ? `You are Kivode+ AI in FILE GENERATION MODE. Return strict JSON only.\nRequired schema: {"files":[{"path":"relative/path.ext","content":"..."}]}\nNever return markdown or prose.\n\n${getProviderStrictJsonPrompt(selectedModel, 'file_repair')}`
            : `${SYSTEM_PROMPT}\n\nAttachment rule: if you need full content of an uploaded attachment, return open_file action with path like \"attachment/<filename>\" before proposing edits.\n\n${getProviderStrictJsonPrompt(selectedModel, 'editor')}`),
        conversationHistory: conversationHistory.slice(-20),
        currentFile: activeFileData ? {
          path: activeFileData.path,
          content: activeFileData.content,
          name: activeFileData.name
        } : null,
        projectContext: {
          path: projectPath,
          openFiles: openFiles.map((f: any) => ({ name: f.name, path: f.path })),
          fileTree: fileTree
        },
        operation: finalIntent === 'chat' ? 'explain' as const : (resolvedCreateFileIntent ? 'generate' as const : 'modify' as const),
        context: [initialSnapshot, pythonContext].filter(Boolean).join('\n\n') || undefined,
        files: mergedContextFiles.length > 0 ? mergedContextFiles : undefined,
        requestId: currentAIRequestIdRef.current || undefined,
      };

      if (finalIntent === 'edit' && !resolvedCreateFileIntent && !activeFileData) {
        appendExecutionLog('No target file resolved yet; model may request open_file or provide direct file patch target.');
      }

      const executionOutcome = {
        updatedEditor: false,
        openedDiff: false,
        createdFiles: 0,
      };
      const touchedFiles = new Set<string>();
      let rollbackSnapshot: { path: string; before: string } | null = null;
      let streamedChatMessages: Message[] | null = null;

      let response;
      if (finalIntent === 'chat') {
        setExecutionStatus('parsing');
        if (attachmentEditIntent && availableAttachments.length > 0) {
          appendExecutionLog('Attachment edit detected: asking model which attachment to open...');
          const candidates = availableAttachments.map((a) => `attachment/${a.name}`).join(', ');
          const planner = await window.electronAPI.ai.reviewCode({
            ...requestParams,
            operation: 'review',
            temperature: 0,
            maxTokens: 300,
            systemPrompt: getProviderStrictJsonPrompt(selectedModel, 'planner'),
            prompt: `${userMessage.content}\n\nChoose one attachment to edit from: ${candidates}\nReturn strict JSON only: {"action":"open_file","path":"attachment/<filename>","reason":"..."}`,
          });

          const plannerPayload = extractJsonInstruction(planner.content);
          const plannerAction = plannerPayload && !Array.isArray(plannerPayload)
            ? (Array.isArray((plannerPayload as any).actions) ? (plannerPayload as any).actions[0] : plannerPayload)
            : null;
          const requestedPath = typeof plannerAction?.path === 'string' ? plannerAction.path : '';
          const requestedName = requestedPath.replace(/^attachment\//, '');
          const targetAttachment = availableAttachments.find((a) => a.name === requestedName) || availableAttachments[0];

          if (!targetAttachment) {
            throw new Error('No attachment available for edit');
          }

          appendExecutionLog(`Model requested full attachment: attachment/${targetAttachment.name}`);
          const pythonRoot = projectPath || await window.electronAPI.app.getPath('temp');
          const loaded = await window.electronAPI.ai.pythonExecute(pythonRoot, {
            action: 'load_attachment',
            name: targetAttachment.name,
            encoding: targetAttachment.encoding,
            content: targetAttachment.content,
          });

          if (!loaded?.ok || typeof loaded?.content !== 'string') {
            throw new Error(`Failed to load full content for attachment ${targetAttachment.name}`);
          }

          appendExecutionLog(`Attachment full content loaded via python: ${targetAttachment.name} (${loaded.lines || 0} lines)`);
          response = await window.electronAPI.ai.explainCode({
            ...requestParams,
            files: [
              ...(requestParams.files || []),
              { path: `attachment/${targetAttachment.name}#full`, content: loaded.content },
            ],
            prompt: `${userMessage.content}\n\nYou are editing an attached file. Return the FULL updated file content in markdown code block, and mention filename explicitly before the code block. Target file: attachment/${targetAttachment.name}`,
            systemPrompt: 'You are a senior software engineer. For attached-file edit requests, return the full updated file in one markdown code block and then a brief summary of applied changes.',
          });
        } else {
          appendExecutionLog('Streaming chat response from provider...');
          const streamed = await streamChatFromProvider(updatedMessages, {
            ...requestParams,
            prompt: `${userMessage.content}\n\nAnswer in normal conversational form unless user explicitly requests code edits. If you provide code or file content, return it only in fenced code blocks with proper language tags (use markdown as language tag for .md files).`
          });
          streamedChatMessages = streamed.finalMessages;
          response = { content: streamed.content, model: selectedModel };
        }
        setExecutionStatus('idle');
      } else if (resolvedCreateFileIntent) {
        setExecutionStatus('parsing');
        appendExecutionLog('Planning new file creation from request...');
        response = await window.electronAPI.ai.generateCode(requestParams);
        executionOutcome.createdFiles = await applyAssistantFiles(response.content);
        if (executionOutcome.createdFiles === 0) {
          appendExecutionLog('No structured files in primary response; attempting structured file repair...');
          executionOutcome.createdFiles = await repairAssistantFiles(response.content || '', userMessage.content);
        }
        executionOutcome.updatedEditor = executionOutcome.createdFiles > 0;
        if (executionOutcome.createdFiles > 0) {
          appendExecutionLog(`Created ${executionOutcome.createdFiles} file(s) from structured response`);
        } else {
          appendExecutionLog('No structured files returned after repair; showing assistant response in chat');
        }
        setExecutionStatus('idle');
      } else {
        response = await window.electronAPI.ai.modifyCode(requestParams);
      }
      if (finalIntent === 'edit' && !resolvedCreateFileIntent && projectPath) {
        setExecutionStatus('parsing');
        appendExecutionLog('Python brain: validating and parsing model plan...');
        const instructionPayload = extractJsonInstruction(response.content);

        setExecutionStatus('patching');
        const ensureInstructionTargetFile = async (instruction: any): Promise<boolean> => {
          if (!instruction || typeof instruction !== 'object') return false;
          if (activeFileData?.path && isInstructionForActiveFile(instruction, activeFileData.path)) return true;
          if (typeof instruction.file !== 'string' || !projectPath) return false;

          const relative = sanitizeRelativePath(instruction.file);

          if (!relative) return false;
          instruction.file = relative;
          const absolutePath = `${projectPath}/${relative}`.replace(/\/+/g, '/');
          const opened = await openProjectFileByRelativePath(relative) || await openProjectFileInEditor(absolutePath);
          if (!opened) return false;
          activeFileData = { ...opened, autoSelected: true };
          appendExecutionLog(`Switched active file from instruction target: ${relative}`);
          return true;
        };
        if (instructionPayload) {
          const instructions = normalizeInstructions(instructionPayload);
          if (instructions.length === 0) {
            throw new Error('No actionable instruction was found in model response');
          }

          for (const instruction of instructions) {
            if (!instruction || typeof instruction !== 'object') continue;

            if (instruction.action === 'needs_context') {
              appendExecutionLog(`Model requested more context: ${instruction.reason || 'unspecified'}`);
              continue;
            }

            if (instruction.action === 'open_file') {
              const rel = typeof instruction.path === 'string' ? sanitizeRelativePath(instruction.path) : null;
              if (!rel) {
                appendExecutionLog('open_file ignored: missing relative path');
                continue;
              }

              if (rel.startsWith('attachment/')) {
                const attachmentName = rel.replace(/^attachment\//, '');
                const attached = availableAttachments.find((f) => f.name === attachmentName);
                if (attached) {
                  activeFileData = {
                    path: rel,
                    name: attached.name,
                    content: attached.content,
                    autoSelected: true,
                    virtualAttachment: true,
                  } as any;
                  appendExecutionLog(`Attachment opened on-demand for full context: ${rel}`);
                } else {
                  appendExecutionLog(`open_file attachment not found in current request: ${rel}`);
                }
                continue;
              }

              const absolutePath = `${projectPath}/${rel}`.replace(/\/+/g, '/');
              const opened = await openProjectFileByRelativePath(rel) || await openProjectFileInEditor(absolutePath);
              if (opened) {
                activeFileData = { ...opened, autoSelected: true };
                appendExecutionLog(`Opened target file from model request: ${rel}`);
              } else {
                appendExecutionLog(`open_file failed for: ${rel}`);
              }
              continue;
            }

            if (instruction.action === 'create_file') {
              const rawPath = typeof instruction.path === 'string' ? sanitizeRelativePath(instruction.path) : null;
              if (!rawPath || typeof instruction.content !== 'string') {
                throw new Error('create_file requires valid relative path and content');
              }
              const absolutePath = `${projectPath}/${rawPath}`.replace(/\/+/g, '/');
              const dirPath = absolutePath.includes('/') ? absolutePath.slice(0, absolutePath.lastIndexOf('/')) : projectPath;
              await window.electronAPI.file.createDirectory(dirPath);
              await window.electronAPI.file.writeFile(absolutePath, instruction.content);
              await refreshFileTree();
              executionOutcome.updatedEditor = true;
              executionOutcome.createdFiles += 1;
              touchedFiles.add(rawPath);
              appendExecutionLog(`Created file via instruction: ${rawPath}`);
              continue;
            }

            const hasTargetFile = await ensureInstructionTargetFile(instruction);
            if (!hasTargetFile) {
              appendExecutionLog('Instruction rejected: no resolvable target file was found');
              throw new Error('Instruction target file could not be resolved');
            }

            appendExecutionLog(`Applying action: ${instruction.action || 'unknown'}`);
            const pythonResult = await window.electronAPI.ai.pythonExecute(projectPath, instruction);
            if (!pythonResult?.ok) {
              appendExecutionLog(`Patch apply warning: ${pythonResult?.error || 'python engine failed'}`);
              continue;
            }

            if (typeof pythonResult.before === 'string' && typeof pythonResult.after === 'string') {
              if (pythonResult.before === pythonResult.after) {
                appendExecutionLog('No code changes were produced');
              }

              if (isOverlyBroadEdit(instruction, pythonResult.before, pythonResult.after)) {
                await window.electronAPI.file.writeFile(activeFileData.path, pythonResult.before);
                appendExecutionLog('Safety rollback: rejected broad replace_body rewrite (requested partial edit)');
                continue;
              }

              rollbackSnapshot = { path: activeFileData.path, before: pythonResult.before };
              if (typeof instruction.file === 'string' && instruction.file.trim()) {
                touchedFiles.add(instruction.file);
              } else if (activeFileData?.path) {
                touchedFiles.add(toRelativeModelPath(activeFileData.path));
              }
              await streamDiffIntoViewer(
                pythonResult.before,
                pythonResult.after,
                instruction.file || activeFileData.path
              );
              executionOutcome.openedDiff = pythonResult.before !== pythonResult.after;
              const snippet = getEditedSnippetSummary(pythonResult.before, pythonResult.after);
              appendExecutionLog(`Edited snippet: ${snippet.replace(/\n/g, ' ').slice(0, 180)}`);
            }
          }
        } else {
          appendExecutionLog('Model returned narrative response, retrying with strict JSON instructions...');
          const strictRetry = await window.electronAPI.ai.modifyCode({
            ...requestParams,
            prompt: `${userMessage.content}\n\nIMPORTANT: Return strict JSON actions only (apply_patch/replace_body/create_file/open_file/needs_context). No prose, no markdown, no full-file rewrites. If target scope is unclear, return needs_context.`,
          });
          const strictPayload = extractJsonInstruction(strictRetry.content);

          if (strictPayload) {
            response = strictRetry;
            const retryInstructions = normalizeInstructions(strictPayload);
            appendExecutionLog(`Strict retry returned ${retryInstructions.length} action(s)`);

            for (const instruction of retryInstructions) {
              if (!instruction || typeof instruction !== 'object') continue;
              if (instruction.action === 'needs_context') {
                appendExecutionLog(`Model requested more context after retry: ${instruction.reason || 'unspecified'}`);
                continue;
              }
              if (instruction.action === 'open_file') {
                const rel = typeof instruction.path === 'string' ? sanitizeRelativePath(instruction.path) : null;
                if (!rel) {
                  appendExecutionLog('Retry open_file ignored: missing relative path');
                  continue;
                }

                if (rel.startsWith('attachment/')) {
                  const attachmentName = rel.replace(/^attachment\//, '');
                  const attached = availableAttachments.find((f) => f.name === attachmentName);
                  if (attached) {
                    activeFileData = {
                      path: rel,
                      name: attached.name,
                      content: attached.content,
                      autoSelected: true,
                      virtualAttachment: true,
                    } as any;
                    appendExecutionLog(`Retry opened attachment for full context: ${rel}`);
                  } else {
                    appendExecutionLog(`Retry open_file attachment not found: ${rel}`);
                  }
                  continue;
                }

                const absolutePath = `${projectPath}/${rel}`.replace(/\/+/g, '/');
                const opened = await openProjectFileByRelativePath(rel) || await openProjectFileInEditor(absolutePath);
                if (opened) {
                  activeFileData = { ...opened, autoSelected: true };
                  appendExecutionLog(`Retry opened target file: ${rel}`);
                } else {
                  appendExecutionLog(`Retry open_file failed for: ${rel}`);
                }
                continue;
              }
              const hasTargetFile = await ensureInstructionTargetFile(instruction);
              if (!hasTargetFile) {
                appendExecutionLog('Retry instruction rejected: target file could not be resolved');
                continue;
              }

              appendExecutionLog(`Applying retry action: ${instruction.action || 'unknown'}`);
              const pythonResult = await window.electronAPI.ai.pythonExecute(projectPath, instruction);
              if (!pythonResult?.ok) {
                appendExecutionLog(`Retry patch apply warning: ${pythonResult?.error || 'python engine failed'}`);
                continue;
              }

              if (typeof pythonResult.before === 'string' && typeof pythonResult.after === 'string') {
                if (isOverlyBroadEdit(instruction, pythonResult.before, pythonResult.after)) {
                  await window.electronAPI.file.writeFile(activeFileData.path, pythonResult.before);
                  appendExecutionLog('Safety rollback: rejected broad replace_body rewrite in strict retry');
                  continue;
                }

                rollbackSnapshot = { path: activeFileData.path, before: pythonResult.before };
                await streamDiffIntoViewer(
                  pythonResult.before,
                  pythonResult.after,
                  instruction.file || activeFileData.path
                );
                executionOutcome.openedDiff = pythonResult.before !== pythonResult.after;
                executionOutcome.updatedEditor = executionOutcome.updatedEditor || executionOutcome.openedDiff;
              }
            }
          } else {
            appendExecutionLog('Strict retry still returned narrative response; attempting JSON action repair...');
            const repair = await window.electronAPI.ai.reviewCode({
              model: selectedModel,
              prompt: `Convert this model output into valid JSON edit actions only.

User request:
${userMessage.content}

Raw model output:
${strictRetry.content}

Allowed actions: apply_patch, replace_body, open_file, needs_context.
Return strict JSON only.`,
              systemPrompt: getProviderStrictJsonPrompt(selectedModel, 'repair'),
              temperature: 0,
              maxTokens: 260,
              operation: 'review',
            });
            const repairedPayload = extractJsonInstruction(repair.content);
            if (repairedPayload) {
              response = repair as any;
              const repairedInstructions = normalizeInstructions(repairedPayload);
              appendExecutionLog(`JSON repair produced ${repairedInstructions.length} action(s)`);
              for (const instruction of repairedInstructions) {
                if (!instruction || typeof instruction !== 'object') continue;
                if (instruction.action === 'needs_context') {
                  appendExecutionLog(`Model requested more context after repair: ${instruction.reason || 'unspecified'}`);
                  continue;
                }
                if (instruction.action === 'open_file') {
                  const rel = typeof instruction.path === 'string' ? sanitizeRelativePath(instruction.path) : null;
                  if (!rel) continue;
                  const absolutePath = `${projectPath}/${rel}`.replace(/\/+/g, '/');
                  const opened = await openProjectFileByRelativePath(rel) || await openProjectFileInEditor(absolutePath);
                  if (opened) activeFileData = { ...opened, autoSelected: true };
                  continue;
                }
                const hasTargetFile = await ensureInstructionTargetFile(instruction);
                if (!hasTargetFile) continue;
                const pythonResult = await window.electronAPI.ai.pythonExecute(projectPath, instruction);
                if (pythonResult?.ok && typeof pythonResult.before === 'string' && typeof pythonResult.after === 'string') {
                  rollbackSnapshot = { path: activeFileData.path, before: pythonResult.before };
                  await streamDiffIntoViewer(pythonResult.before, pythonResult.after, instruction.file || activeFileData.path);
                  executionOutcome.openedDiff = pythonResult.before !== pythonResult.after;
                  executionOutcome.updatedEditor = executionOutcome.updatedEditor || executionOutcome.openedDiff;
                }
              }
            } else {
              appendExecutionLog('JSON repair failed; attempting fallback action extraction from narrative response...');
              const fallbackInstructions = createFallbackInstructions(strictRetry.content || response?.content || '');
              if (fallbackInstructions.length > 0) {
                appendExecutionLog(`Fallback extraction produced ${fallbackInstructions.length} action(s)`);
                for (const instruction of fallbackInstructions) {
                  if (!instruction || typeof instruction !== 'object') continue;
                  if (instruction.action === 'needs_context') {
                    appendExecutionLog(`Fallback requested more context: ${instruction.reason || 'unspecified'}`);
                    continue;
                  }
                  const hasTargetFile = await ensureInstructionTargetFile(instruction);
                  if (!hasTargetFile) continue;
                  const pythonResult = await window.electronAPI.ai.pythonExecute(projectPath, instruction);
                  if (pythonResult?.ok && typeof pythonResult.before === 'string' && typeof pythonResult.after === 'string') {
                    rollbackSnapshot = { path: activeFileData.path, before: pythonResult.before };
                    await streamDiffIntoViewer(pythonResult.before, pythonResult.after, instruction.file || activeFileData.path);
                    executionOutcome.openedDiff = pythonResult.before !== pythonResult.after;
                    executionOutcome.updatedEditor = executionOutcome.updatedEditor || executionOutcome.openedDiff;
                  }
                }
              } else {
                appendExecutionLog('JSON repair failed; edit flow requires structured diff actions only');
              }
            }
          }
        }

        setExecutionStatus('validating');
        const validation = await window.electronAPI.ai.pythonExecute(projectPath, { action: 'validate' });
        if (validation?.ok) {
          appendExecutionLog('Validation completed');
        } else if (rollbackSnapshot) {
          await window.electronAPI.file.writeFile(rollbackSnapshot.path, rollbackSnapshot.before);
          appendExecutionLog(`Validation failed; rolled back changes on ${rollbackSnapshot.path}`);
          addToast({
            type: 'error',
            title: 'Change Reverted',
            message: validation?.error || 'Applied patch broke project validation, so it was rolled back.',
          });
          executionOutcome.openedDiff = false;
          executionOutcome.updatedEditor = false;
        }
        setExecutionStatus('idle');
      }

      if (response?.usage) {
        setLastTokenUsage({
          prompt: response.usage.promptTokens || 0,
          completion: response.usage.completionTokens || 0,
          total: response.usage.totalTokens || 0,
        });
      }
      const hasAppliedVisualChange = executionOutcome.updatedEditor || executionOutcome.openedDiff || executionOutcome.createdFiles > 0;

      let finalMessages = updatedMessages;
      if (finalIntent === 'chat') {
        finalMessages = streamedChatMessages || await streamAssistantMessage(updatedMessages, response.content, operation);
      } else if (hasAppliedVisualChange) {
        const touched = Array.from(touchedFiles).filter(Boolean);
        const summaryLines = [
          '✅ Code mode update completed.',
          touched.length > 0
            ? `Updated files: ${touched.join(', ')}`
            : (activeFileData?.path ? `Updated target: ${toRelativeModelPath(activeFileData.path)}` : 'Updated project files.'),
          executionOutcome.openedDiff
            ? 'A diff preview was generated for review.'
            : 'Changes were applied directly to the editor files.',
        ];
        const codeSummaryMessage: Message = {
          id: `assistant-code-summary-${Date.now()}`,
          role: 'assistant',
          content: summaryLines.join('\n'),
          timestamp: new Date(),
          type: operation,
          files: touched,
        };
        finalMessages = [...updatedMessages, codeSummaryMessage];
        setMessages(finalMessages);
        addToast({
          type: 'success',
          title: 'Code Updated',
          message: executionOutcome.openedDiff
            ? 'Changes are ready in Diff view for review.'
            : 'Code was written to editor successfully.',
        });
      } else {
        addToast({
          type: 'warning',
          title: 'No Code Changes',
          message: 'No actionable diff was produced. Clarify the target function/section and try again.',
        });
        appendExecutionLog('Edit request finished without actionable diff output; narrative/code-dump response was suppressed for safety.');
      }

      // Updates session state.
      setChatSessions(prev => {
        const updated = prev.map(s => 
          s.id === activeSessionId 
            ? { ...s, messages: finalMessages, updatedAt: new Date() }
            : s
        );
        saveSessions(updated);
        return updated;
      });

      pendingTitleSessionId = activeSessionId;
      pendingTitleConversation = finalMessages;

      // Clears drafts after successful send.
      localStorage.removeItem(`kivode-draft-${activeSessionId}`);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Cancelled by user
      }

      if (isRequestInFlightError(error)) {
        return;
      }
      
      console.error('AI request failed:', error);
      
      const errorContent = getErrorMessage(error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        files: []
      };
      setMessages(prev => [...prev, errorMessage]);
      addToast({
        type: 'error',
        title: 'AI Error',
        message: error.message || 'Failed to get AI response',
      });
      setExecutionStatus('idle');
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      currentAIRequestIdRef.current = null;

      if (pendingTitleSessionId && pendingTitleConversation) {
        await maybeGenerateSessionTitle(pendingTitleSessionId, pendingTitleConversation);
      }
    }
  };

  const writeClipboardText = async (text: string) => {
    try {
      if (window.electronAPI?.clipboard?.writeText) {
        window.electronAPI.clipboard.writeText(text);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (error) {
      throw error;
    }
  };

  // Copies content to clipboard.
  const copyToClipboard = async (content: string, id: string) => {
    try {
      await writeClipboardText(content);
      setCopiedId(id);
      addToast({
        type: 'success',
        title: 'Copied',
        message: 'Content copied to clipboard',
        duration: 2000
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy to clipboard'
      });
    }
  };

  // Copies selected code only.
  const copyCodeBlock = async (code: string) => {
    try {
      await writeClipboardText(code);
      addToast({
        type: 'success',
        title: 'Code Copied',
        message: 'Code block copied to clipboard',
        duration: 2000
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy code'
      });
    }
  };

  // Handles Enter key behavior.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  const formatBytes = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  const detectCodeLanguage = (className?: string, rawCode?: string) => {
    const fromClass = String(className || '').replace('language-', '').trim();
    if (fromClass) return fromClass;

    const firstLine = String(rawCode || '').split('\n')[0]?.toLowerCase() || '';
    if (firstLine.includes('<!doctype html') || firstLine.includes('<html')) return 'html';
    if (firstLine.includes('import ') && firstLine.includes('from ')) return 'typescript';
    if (firstLine.startsWith('# ')) return 'markdown';
    if (firstLine.includes('def ') || firstLine.includes('import ')) return 'python';
    return 'text';
  };

  const getAttachmentVisual = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'php', 'rb', 'swift', 'kt'].includes(ext)) {
      return { Icon: FileCode, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20', label: 'Code file' };
    }
    if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) {
      return { Icon: FileJson, tone: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20', label: 'Structured document' };
    }
    if (['csv', 'xlsx', 'xls'].includes(ext)) {
      return { Icon: FileSpreadsheet, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Spreadsheet' };
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return { Icon: FileArchive, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Archive' };
    }
    if (['md', 'txt', 'pdf', 'doc', 'docx', 'rtf'].includes(ext)) {
      return { Icon: FileText, tone: 'text-primary bg-primary/10 border-primary/20', label: 'Document' };
    }
    return { Icon: File, tone: 'text-muted-foreground bg-muted/60 border-border/50', label: 'File' };
  };

  // Splits long content into sections.
  const truncateContent = (content: string, maxLength: number = 500) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  // Derived view values.
  const currentModel = (availableModels.length > 0 ? availableModels : AVAILABLE_MODELS).find(m => m.id === selectedModel);
  const currentProvider = (currentModel?.provider || 'openai') as ApiProvider;
  const activeStreamingAssistantMessage = isGenerating
    ? [...messages].reverse().find((m) => m.role === 'assistant') || null
    : null;
  const shouldRenderStandaloneThinkingBubble = isGenerating && !activeStreamingAssistantMessage;
  const inferredSandboxTask: SandboxTask | null = executionLogs.length > 0 ? {
    id: `engine-${executionLogs.length}`,
    title: 'AI Edit Session',
    type: 'engine-pipeline',
    status: executionStatus === 'idle'
      ? (executionLogs.some((log) => /failed|error|reverted/i.test(log)) ? 'failed' : 'completed')
      : 'running',
    createdAt: new Date().toISOString(),
    input: { source: 'engine', generatedFromLogs: true },
    logs: executionLogs.slice(-120),
    result: {
      summary: executionLogs[executionLogs.length - 1] || 'Execution in progress',
      data: {
        inferred: true,
        stage: executionStatus,
      },
    },
  } : null;
  const allSandboxTasks = sandboxTasks.length > 0 ? sandboxTasks : (inferredSandboxTask ? [inferredSandboxTask] : []);
  const visibleSandboxTasks = allSandboxTasks.filter((task) => sandboxFilter === 'all' || task.status === sandboxFilter);
  const selectedSandboxTask = allSandboxTasks.find((task) => task.id === selectedSandboxTaskId) || (visibleSandboxTasks[0] ?? null);
  const selectedTaskDurationMs = selectedSandboxTask?.result?.durationMs;
  const selectedTaskDurationLabel = typeof selectedTaskDurationMs === 'number'
    ? `${(selectedTaskDurationMs / 1000).toFixed(2)}s`
    : 'N/A';
  const selectedTaskResultData = selectedSandboxTask?.result?.data;
  const selectedTaskWarnings = Array.isArray(selectedTaskResultData?.warnings)
    ? selectedTaskResultData.warnings
    : selectedSandboxTask?.result?.stderr
      ? [selectedSandboxTask.result.stderr]
      : [];
  const selectedTaskSecurity = selectedTaskResultData?.security || {
    network: 'disabled',
    filesystem: 'restricted to workspace + sandbox root',
    process: 'blocked'
  };
  const sandboxTimeline = [
    ...executionLogs.map((log) => `[engine] ${log}`),
    ...allSandboxTasks
      .slice(0, 12)
      .flatMap((task) => (task.logs || []).slice(-3).map((entry) => `[${task.status}] ${task.title} :: ${entry}`)),
  ].slice(-80);

  return (
    <div className={cn(
      "flex flex-col h-full w-full min-w-0 bg-background relative overflow-hidden",
      showWorkspaceModal && "fixed inset-6 z-[80] rounded-2xl border border-border shadow-2xl"
    )}>
      
      {/* Background Effects - Subtle and professional */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/[0.03] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/[0.02] rounded-full blur-[80px] translate-y-1/2 -translate-x-1/4" />
      </div>

      {/* History Sidebar */}
      <AnimatePresence mode="wait">
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setShowHistory(false)}
            />
            <motion.div
              initial={{ x: '100%', opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.8 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
              className="absolute right-0 top-0 h-full w-80 bg-card/95 border-l border-border/50 shadow-2xl z-50 flex flex-col backdrop-blur-xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-border/50 bg-card/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <History className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">Chat History</h3>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 rounded-lg hover:bg-primary/10"
                    onClick={startNewChat}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    New
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-primary/10"
                    onClick={() => setShowHistory(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3">
                {chatSessions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary/5 flex items-center justify-center">
                      <MessageSquare className="w-10 h-10 text-primary/30" />
                    </div>
                    <p className="text-sm font-medium">No chat history</p>
                    <p className="text-xs mt-2">Start a new conversation</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {chatSessions.map((session, idx) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => loadSession(session)}
                        className={cn(
                          "group relative p-4 rounded-xl cursor-pointer transition-all border",
                          currentSessionId === session.id 
                            ? "bg-primary/10 border-primary/30 shadow-md" 
                            : "bg-card/50 border-border/30 hover:border-primary/20 hover:bg-card"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="font-medium text-sm truncate pr-8">
                              {session.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {session.messages.length} messages • {session.updatedAt.toLocaleDateString()}
                            </p>
                            {session.projectContext.path && (
                              <p className="text-xs text-primary/70 truncate mt-1 flex items-center gap-1">
                                <FolderTree className="w-3 h-3 shrink-0" />
                                <span className="truncate">{session.projectContext.path.split(/[\\/]/).pop()}</span>
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute top-3 right-3 hover:bg-red-500/10 hover:text-red-500"
                            onClick={(e) => deleteSession(session.id, e)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowShortcuts(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 pointer-events-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Keyboard className="w-5 h-5" />
                    Keyboard Shortcuts
                  </h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowShortcuts(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-t border-border/30 pt-3 mt-3">
                    <span>Send Message</span>
                    <kbd className="px-2 py-1 rounded bg-muted text-xs font-sans">Ctrl + Enter</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>Show Shortcuts</span>
                    <kbd className="px-2 py-1 rounded bg-muted text-xs font-sans">Ctrl + K</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>Close/Cancel</span>
                    <kbd className="px-2 py-1 rounded bg-muted text-xs font-sans">Escape</kbd>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ✅ Header - Redesigned Professional Layout */}
      <div className="flex flex-col border-b border-border/40 bg-card/40 backdrop-blur-md shrink-0 relative z-10">
        {/* Top Row: Logo & Main Info */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center shadow-lg shadow-primary/5 border border-primary/10">
                <BrandLogo className="w-8 h-8 text-primary" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background" />
            </div>
            
            {/* Text Info */}
            <div className="flex flex-col">
              <h2 className="font-bold text-lg tracking-tight leading-none">Kivode+ AI</h2>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                {projectName ? projectName : 'Ready to assist'}
              </p>
            </div>
          </div>
          
          {/* Small Icon Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
              onClick={startNewChat}
              title="New Chat"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 rounded-lg hover:bg-primary/10", showHistory && "bg-primary/10")}
              onClick={() => setShowHistory(!showHistory)}
              title="History"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
              onClick={() => setShowWorkspaceModal(prev => !prev)}
              title={showWorkspaceModal ? 'Exit expanded workspace' : 'Expand workspace'}
            >
              {showWorkspaceModal ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

    {/* Model Selector - Fixed opacity */}
<div 
  className={cn(
    "px-5 py-3 border-b border-border/40 bg-card shrink-0 relative",
    showModelMenu ? "z-[100]" : "z-10"
  )}
>
  <div className="relative" ref={modelMenuRef}>
    <button
      onClick={() => setShowModelMenu(!showModelMenu)}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-accent transition-all duration-200 group shadow-sm"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-primary bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <ProviderIcon provider={currentProvider} className="w-5 h-5" />
        </div>
        <div className="text-left min-w-0">
          <p className="font-semibold text-sm truncate">{currentModel?.name || 'Select Model'}</p>
          <p className="text-xs text-muted-foreground font-medium">{PROVIDER_NAMES[currentProvider]}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium border border-border">
          {currentModel?.maxTokens ? `${(currentModel.maxTokens / 1000).toFixed(0)}k` : '∞'}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", showModelMenu && "rotate-180")} />
      </div>
    </button>

    <AnimatePresence>
      {showModelMenu && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-[200] max-h-[420px] overflow-hidden"
          style={{ backgroundColor: 'hsl(var(--card))' }}
        >
          <div className="p-2 overflow-y-auto max-h-[420px]">
            {Object.entries(
              (availableModels.length > 0 ? availableModels : AVAILABLE_MODELS).reduce((acc, model) => {
                if (!acc[model.provider]) acc[model.provider] = [];
                acc[model.provider].push(model);
                return acc;
              }, {} as Record<ApiProvider, AIModel[]>)
            ).map(([provider, models]) => (
              <div key={provider} className="mb-2 last:mb-0">
                <div className={cn("px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 rounded-lg", PROVIDER_BG_COLORS[provider as ApiProvider])}>
                  <ProviderIcon provider={provider as ApiProvider} className="w-4 h-4" />
                  {PROVIDER_NAMES[provider as ApiProvider]}
                </div>
                <div className="space-y-0.5 mt-1">
                  {models.map(model => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelMenu(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                        selectedModel === model.id 
                          ? "bg-primary/10 text-primary" 
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <div className="w-5 h-5 flex items-center justify-center text-primary/60">
                        <ProviderIcon provider={provider as ApiProvider} className="w-4 h-4" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="block font-medium">{model.name}</span>
                        <span className="text-[10px] text-muted-foreground">{model.maxTokens.toLocaleString()} tokens • {model.category}</span>
                      </div>
                      {selectedModel === model.id && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
</div>

      <div className="mx-5 mt-3 rounded-xl border border-border/50 bg-muted/20 p-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="w-4 h-4 text-primary" />
            Python Sandbox
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowPythonLogsModal((prev) => !prev)}
              title={showPythonLogsModal ? 'Hide Python Sandbox Console' : 'Show Python Sandbox Console'}
            >
              {showPythonLogsModal ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
            <span className={cn(
              "text-xs px-2 py-1 rounded-full border",
              sandboxStatus?.available ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" : "text-amber-600 border-amber-500/30 bg-amber-500/10"
            )}>
              {sandboxStatus?.available ? 'Active' : 'Unavailable'}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {['Sandboxed', 'Network Disabled', 'FS Restricted'].map((badge) => (
            <span key={badge} className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary">{badge}</span>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          <p>Status: <span className="font-medium">{executionStatus.toUpperCase()}</span></p>
          <p>Environment: <span className="font-medium">{sandboxEnvironmentState.toUpperCase()}</span></p>
          <p className="truncate">↳ {executionLogs[executionLogs.length - 1] || 'Awaiting next task...'}</p>
        </div>
      </div>

      <AnimatePresence>
        {showPythonLogsModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm"
              onClick={() => setShowPythonLogsModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 14 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="w-full max-w-6xl h-[84vh] bg-card border border-border/60 rounded-2xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-border/60 bg-card/95">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-primary" />
                        Python Sandbox Console
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">Live sandbox telemetry, task lifecycle details, warnings, security posture, and execution steps.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => refreshSandboxTasks().catch(() => undefined)} className="gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setShowPythonLogsModal(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary">{allSandboxTasks.length} Tasks</span>
                    <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700">Environment {sandboxEnvironmentState.toUpperCase()}</span>
                    <span className="px-2 py-1 rounded-full border border-border/60 bg-muted/40">Execution {executionStatus.toUpperCase()}</span>
                  </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-4 bg-gradient-to-b from-card to-card/70 overflow-hidden">
                  <div className="col-span-4 border border-border/50 rounded-xl p-3 overflow-hidden flex flex-col bg-background/40">
                    <p className="text-xs font-semibold mb-2">Task Queue</p>
                    <div className="flex gap-1 mb-3 flex-wrap">
                      {['all', 'pending_approval', 'running', 'completed', 'failed', 'canceled'].map((item) => (
                        <button key={item} onClick={() => setSandboxFilter(item as any)} className={cn('text-[10px] px-2 py-1 rounded border transition-colors', sandboxFilter === item ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted/40')}>
                          {item}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2 overflow-y-auto pr-1 min-h-0">
                      {visibleSandboxTasks.map((task) => (
                        <button key={task.id} onClick={() => setSelectedSandboxTaskId(task.id)} className={cn('w-full text-left rounded-lg border p-2.5 transition-colors', selectedSandboxTaskId === task.id ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:bg-muted/40')}>
                          <div className="text-xs font-semibold truncate">{task.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-1">{task.status} • {new Date(task.createdAt).toLocaleTimeString()}</div>
                          <div className="text-[10px] text-muted-foreground truncate mt-1">{task.type}</div>
                        </button>
                      ))}
                      {visibleSandboxTasks.length === 0 && (
                        <div className="text-xs text-muted-foreground border border-dashed rounded p-2">No tasks in this filter yet. Keep this console open and click <span className="font-semibold">Refresh</span> to fetch new tasks immediately.</div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-8 min-h-0 grid grid-rows-[auto_auto_1fr] gap-3">
                    {!selectedSandboxTask ? (
                      <>
                        <div className="border border-border/50 rounded-xl p-4 bg-background/30">
                          <p className="text-sm text-muted-foreground">No task is selected yet. Live logs are shown below to help you verify sandbox activity in real time.</p>
                        </div>
                        <div className="border border-border/50 rounded-xl p-3 bg-background/30">
                          <h4 className="text-xs font-semibold mb-2">Sandbox Status</h4>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg border border-border/50 p-2">
                              <p className="text-muted-foreground">Runner</p>
                              <p className="font-semibold mt-1 truncate">{sandboxStatus?.available ? 'Available' : 'Unavailable'}</p>
                            </div>
                            <div className="rounded-lg border border-border/50 p-2">
                              <p className="text-muted-foreground">Last Engine Event</p>
                              <p className="font-semibold mt-1 truncate">{executionLogs[executionLogs.length - 1] || 'No events yet'}</p>
                            </div>
                            <div className="rounded-lg border border-border/50 p-2">
                              <p className="text-muted-foreground">Tracked Tasks</p>
                              <p className="font-semibold mt-1">{allSandboxTasks.length}</p>
                            </div>
                          </div>
                        </div>
                        <div className="border border-border/50 rounded-xl p-3 min-h-0 bg-background/30 flex flex-col">
                          <h4 className="text-xs font-semibold mb-2">Live Activity Timeline</h4>
                          <div className="space-y-2 text-xs font-mono text-muted-foreground overflow-auto min-h-0">
                            {sandboxTimeline.length > 0 ? sandboxTimeline.map((log, idx) => (
                              <div key={`${idx}-${log}`} className="p-2 rounded bg-muted/30 border border-border/40">{log}</div>
                            )) : <div className="text-xs text-muted-foreground">No live logs captured yet.</div>}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="border border-border/50 rounded-xl p-3 bg-background/30">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                              <h4 className="font-semibold">{selectedSandboxTask.title}</h4>
                              <p className="text-xs text-muted-foreground">{selectedSandboxTask.type}</p>
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary">{selectedSandboxTask.status}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg border border-border/50 p-2 bg-card/60">
                              <p className="text-muted-foreground">Execution Time</p>
                              <p className="font-semibold mt-1">{selectedTaskDurationLabel}</p>
                            </div>
                            <div className="rounded-lg border border-border/50 p-2 bg-card/60">
                              <p className="text-muted-foreground">Memory Limit</p>
                              <p className="font-semibold mt-1">{selectedSandboxTask.input?.memory_mb || selectedSandboxTask.input?.memoryMb || 'N/A'} MB</p>
                            </div>
                            <div className="rounded-lg border border-border/50 p-2 bg-card/60">
                              <p className="text-muted-foreground">Task Created</p>
                              <p className="font-semibold mt-1">{new Date(selectedSandboxTask.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 min-h-[180px]">
                          <div className="border border-border/50 rounded-xl p-3 overflow-auto bg-background/30">
                            <h4 className="text-xs font-semibold mb-2">Structured Result</h4>
                            <pre className="text-xs bg-muted/30 border border-border/40 rounded p-2 overflow-auto max-h-40">{safeJsonStringify(selectedSandboxTask.result || {}, 2)}</pre>
                          </div>
                          <div className="border border-border/50 rounded-xl p-3 overflow-auto space-y-2 bg-background/30">
                            <h4 className="text-xs font-semibold">Warnings</h4>
                            {selectedTaskWarnings.length > 0 ? (
                              selectedTaskWarnings.map((warning, idx) => (
                                <div key={`${warning}-${idx}`} className="text-xs p-2 rounded border border-amber-500/30 bg-amber-500/10 text-amber-700">{String(warning)}</div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">No warnings reported.</p>
                            )}
                            <h4 className="text-xs font-semibold pt-1">Security Info</h4>
                            <div className="text-xs rounded border border-emerald-500/30 bg-emerald-500/10 p-2 space-y-1">
                              <p><span className="font-semibold">Network:</span> {String(selectedTaskSecurity.network || 'disabled')}</p>
                              <p><span className="font-semibold">Filesystem:</span> {String(selectedTaskSecurity.filesystem || 'restricted')}</p>
                              <p><span className="font-semibold">Process Execution:</span> {String(selectedTaskSecurity.process || 'blocked')}</p>
                            </div>
                          </div>
                        </div>

                        <div className="border border-border/50 rounded-xl p-3 min-h-0 flex flex-col bg-background/30">
                          <h4 className="text-xs font-semibold mb-2">Detailed Running Steps</h4>
                          <div className="grid grid-cols-2 gap-3 min-h-0">
                            <div className="min-h-0 overflow-auto border border-border/40 rounded p-2 bg-muted/20">
                              <p className="text-[11px] font-semibold mb-2">Task Logs</p>
                              <div ref={taskLogScrollRef} className="space-y-2 text-xs font-mono text-muted-foreground overflow-y-auto max-h-[280px] pr-1">
                                {(selectedSandboxTask.logs || []).length ? (selectedSandboxTask.logs || []).slice(-120).map((log, idx) => (
                                  <div key={`${idx}-${log}`} className="p-2 rounded bg-muted/30 border border-border/40">{log}</div>
                                )) : <div className="text-xs text-muted-foreground">No task logs yet.</div>}
                              </div>
                            </div>
                            <div className="min-h-0 overflow-auto border border-border/40 rounded p-2 bg-muted/20">
                              <p className="text-[11px] font-semibold mb-2">Live Engine Timeline</p>
                              <div ref={timelineScrollRef} className="space-y-2 text-xs font-mono text-muted-foreground overflow-y-auto max-h-[280px] pr-1">
                                {sandboxTimeline.slice(-120).map((log, idx) => (
                                  <div key={`${idx}-${log}`} className="p-2 rounded bg-muted/30 border border-border/40">{log}</div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-border/60 flex gap-2 flex-wrap justify-end bg-card/95">
                  {selectedSandboxTask?.status === 'pending_approval' && (
                    <Button size="sm" onClick={async () => {
                      try {
                        if (!projectPath || !selectedSandboxTask) return;
                        await window.electronAPI.sandbox.approveTask(projectPath, selectedSandboxTask.id);
                        await refreshSandboxTasks();
                      } catch (error: any) {
                        appendExecutionLog(`Sandbox approve error: ${error?.message || 'unknown error'}`);
                      }
                    }}>Approve</Button>
                  )}
                  {selectedSandboxTask && ['pending_approval', 'queued', 'running'].includes(selectedSandboxTask.status) && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        await window.electronAPI.sandbox.cancelTask(selectedSandboxTask.id);
                        await refreshSandboxTasks();
                      } catch (error: any) {
                        appendExecutionLog(`Sandbox cancel error: ${error?.message || 'unknown error'}`);
                      }
                    }}>Cancel</Button>
                  )}
                  {selectedSandboxTask && ['completed', 'failed', 'canceled'].includes(selectedSandboxTask.status) && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        await window.electronAPI.sandbox.closeTask(selectedSandboxTask.id);
                        await refreshSandboxTasks();
                      } catch (error: any) {
                        appendExecutionLog(`Sandbox close error: ${error?.message || 'unknown error'}`);
                      }
                    }}>Close</Button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWorkspaceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[87]"
            onClick={() => setShowWorkspaceModal(false)}
          />
        )}
      </AnimatePresence>

      <div className={cn(
        "flex flex-col flex-1 min-h-0",
        showWorkspaceModal && "fixed inset-10 z-[88] rounded-2xl border border-border bg-background shadow-2xl"
      )}>
      {/* Messages - Enhanced with better spacing and typography */}
      <div className="flex-1 overflow-y-auto min-h-0 relative z-10" ref={messagesContainerRef}>
        <div className="p-5 space-y-6">
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-center py-16 text-muted-foreground"
            >
              <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center shadow-xl shadow-primary/5 border border-primary/10">
                <Terminal className="w-12 h-12 text-primary/40" />
              </div>
              <h3 className="font-semibold text-xl mb-3 text-foreground">Welcome to Kivode+ AI</h3>
              <p className="text-sm max-w-sm mx-auto mb-8 leading-relaxed text-muted-foreground/80">
                {projectPath 
                  ? "Python indexed your project. Ask for focused edits, refactors, bug-fixes, and improvements on opened files."
                  : "Open a project to enable Python-first analysis, automatic planning, and structured edit workflow."}
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                {(projectPath 
                  ? ['Refactor this function', 'Fix this bug', 'Improve performance', 'Harden error handling']
                  : ['Open project and index', 'Review architecture', 'Find risky code paths', 'Plan safe refactor']
                ).map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 rounded-full border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.filter(m => m.role !== 'system').map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* Avatar - Enhanced styling */}
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border',
                message.role === 'user'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : message.role === 'system'
                    ? 'bg-muted border-border/50 text-muted-foreground'
                    : 'bg-transparent border-border/50 text-foreground'
              )}>
                {message.role === 'user' ? (
                  <Code2 className="w-5 h-5" />
                ) : message.role === 'system' ? (
                  <FolderTree className="w-5 h-5" />
                ) : (
                  <div className="w-6 h-6 flex items-center justify-center">
                    <ProviderIcon provider={currentProvider} className="w-5 h-5" />
                  </div>
                )}
              </div>

              {/* Message Content - Enhanced card design */}
              <div className={cn(
                'min-w-0 rounded-2xl p-4 overflow-hidden border',
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground max-w-[78%] border-primary/40 shadow-sm' 
                  : message.role === 'system' 
                    ? 'bg-card/70 border-border/40 max-w-[86%]' 
                    : 'bg-card border-border/50 max-w-[86%] shadow-sm'
              )}>
                {message.type && message.role === 'user' && (
                  <div className="flex items-center gap-2 mb-3 opacity-90">
                    <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                      <Wand2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider">{message.type}</span>
                  </div>
                )}
                
                {message.role === 'assistant' && isGenerating && index === messages.length - 1 && !message.content.trim() ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wand2 className="w-4 h-4 text-amber-500" />
                      <span>Thinking and preparing response...</span>
                    </div>
                    <div className="flex gap-2">
                      <motion.span 
                        className="w-2 h-2 bg-amber-500 rounded-full"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.span 
                        className="w-2 h-2 bg-amber-500 rounded-full"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.1, ease: "easeInOut" }}
                      />
                      <motion.span 
                        className="w-2 h-2 bg-amber-500 rounded-full"
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2, ease: "easeInOut" }}
                      />
                    </div>
                  </div>
                ) : (
                  message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none leading-relaxed dark:prose-invert break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code(props: any) {
                            const { inline, className, children, ...rest } = props;
                            const raw = String(children ?? '').replace(/\n$/, '');
                            if (inline) {
                              return <code className="px-1.5 py-0.5 rounded-md bg-muted/70 text-[13px] font-mono" {...rest}>{children}</code>;
                            }
                            const language = detectCodeLanguage(className, raw);
                            const prefersDark = typeof document !== 'undefined'
                              ? document.documentElement.classList.contains('dark')
                              : true;
                            return (
                              <div className="not-prose my-3 overflow-hidden rounded-xl border border-border/70 bg-muted/60">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 text-[11px] text-muted-foreground">
                                  <span className="uppercase tracking-wide">{language}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => copyCodeBlock(raw.trim())}
                                  >
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy code
                                  </Button>
                                </div>
                                <SyntaxHighlighter
                                  language={language}
                                  style={prefersDark ? oneDark : oneLight}
                                  showLineNumbers
                                  wrapLongLines={false}
                                  customStyle={{ margin: 0, padding: '14px 16px', fontSize: '13px', lineHeight: '1.6' }}
                                  lineNumberStyle={{ opacity: 0.55, minWidth: '2.8em', display: 'inline-block', whiteSpace: 'nowrap', paddingRight: '0.75em' }}
                                  codeTagProps={{ ...rest, className: 'font-mono' }}
                                >
                                  {raw}
                                </SyntaxHighlighter>
                              </div>
                            );
                          },
                          table: (props: any) => <div className="not-prose my-3 overflow-x-auto"><table className="w-full border-collapse rounded-lg overflow-hidden border border-border/70" {...props} /></div>,
                          th: (props: any) => <th className="border border-border/70 bg-muted/60 px-3 py-2 text-left" {...props} />,
                          td: (props: any) => <td className="border border-border/60 px-3 py-2" {...props} />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {message.content}
                    </div>
                  )
                )}

                {message.files && message.files.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {message.files.map(filePath => {
                      const fileName = filePath.split(/[\\/]/).pop() || filePath;
                      const visual = getAttachmentVisual(fileName);
                      const isAttachment = filePath.startsWith('attachment/');
                      return (
                        <div
                          key={filePath}
                          className={cn(
                            'rounded-xl border px-3 py-2 flex items-center gap-3',
                            message.role === 'user' ? 'bg-white/10 border-white/20' : 'bg-muted/40 border-border/50'
                          )}
                        >
                          <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center', visual.tone)}>
                            <visual.Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{fileName}</div>
                            <div className="text-[11px] opacity-70">{isAttachment ? 'Attached file' : 'Referenced file'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
                  <span className="text-xs opacity-50 shrink-0 font-medium">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {message.role === 'assistant' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs px-2.5 rounded-lg hover:bg-primary/10 transition-colors"
                        onClick={() => regenerateFromAssistantMessage(message.id)}
                        disabled={isGenerating}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="font-medium">Regenerate</span>
                      </Button>
                    )}

                    {message.role === 'user' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs px-2.5 rounded-lg hover:bg-primary/10 transition-colors"
                        onClick={() => beginEditUserMessage(message)}
                        disabled={isGenerating}
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span className="font-medium">Edit</span>
                      </Button>
                    )}
                    
                    {message.role === 'assistant' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs px-2.5 rounded-lg hover:bg-primary/10 transition-colors"
                        onClick={() => copyToClipboard(message.content, message.id)}
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="font-medium">Copy</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {shouldRenderStandaloneThinkingBubble && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4"
            >
              <div className="w-10 h-10 rounded-2xl bg-transparent border border-border/50 flex items-center justify-center shrink-0">
                <div className="w-6 h-6 flex items-center justify-center text-foreground">
                  <ProviderIcon provider={currentProvider} className="w-5 h-5" />
                </div>
              </div>
              <div className="bg-card/70 border border-border/40 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wand2 className="w-4 h-4 text-amber-500" />
                  <span>Thinking and preparing response...</span>
                </div>
                <div className="flex gap-2">
                  <motion.span 
                    className="w-2 h-2 bg-amber-500 rounded-full"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.span 
                    className="w-2 h-2 bg-amber-500 rounded-full"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.1, ease: "easeInOut" }}
                  />
                  <motion.span 
                    className="w-2 h-2 bg-amber-500 rounded-full"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.2, ease: "easeInOut" }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ✅ Input Area - Redesigned with Attach Button */}
      <div className="p-4 border-t border-border/40 bg-card/30 backdrop-blur-md shrink-0 relative z-10">
        {editingMessageId && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <FileEdit className="w-3.5 h-3.5" />
              Editing a previous user message. Sending will replace that point and remove everything after it.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setEditingMessageId(null)}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Attached Files Preview */}
        {attachedFiles.length > 0 && (
          <div className="grid gap-2 mb-3">
            {attachedFiles.map((file, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center justify-between gap-3 bg-card border border-border/60 px-3 py-2.5 rounded-xl"
              >
                {(() => {
                  const visual = getAttachmentVisual(file.name);
                  return (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn('w-11 h-11 rounded-lg border flex items-center justify-center', visual.tone)}>
                          <visual.Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{file.name}</div>
                          <div className="text-xs text-muted-foreground">{visual.label} • {formatBytes(file.size)}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeAttachedFile(idx)}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Remove attachment"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  );
                })()}
              </motion.div>
            ))}
          </div>
        )}
        
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!activeFile && projectPath
              ? (assistantMode === 'code'
                ? "Code mode: describe the exact code change you want."
                : "Chat mode: ask anything about your project.")
              : (assistantMode === 'code'
                ? "Code mode: describe edit/patch/refactor request."
                : "Chat mode: ask questions, architecture, explanations.")}
            className={cn(
              "pr-24 resize-none text-sm bg-background/80 border-border/40 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 rounded-xl break-all shadow-inner",
              showWorkspaceModal ? 'min-h-[72px]' : 'min-h-[100px]'
            )}
            disabled={isGenerating}
            style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}
          />
          
          {/* Action Buttons */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {/* Attach Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              multiple
              accept=".js,.ts,.jsx,.tsx,.py,.java,.cpp,.c,.h,.html,.css,.json,.md,.txt,.sql,.yaml,.yml,.xml,.sh,.bash,.zsh,.ps1,.rb,.go,.rs,.swift,.kt,.dart,.php,text/*"
            />
            
            {!isGenerating && (
              <div className="flex items-center rounded-lg border border-border/60 bg-background/80 p-0.5 mr-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 px-2.5 text-[11px] rounded-md gap-1.5',
                    assistantMode === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  )}
                  onClick={() => setAssistantMode('chat')}
                  title="Chat mode"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 px-2.5 text-[11px] rounded-md gap-1.5',
                    assistantMode === 'code' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  )}
                  onClick={() => setAssistantMode('code')}
                  title="Code mode"
                >
                  <Braces className="w-3.5 h-3.5" />
                  Code
                </Button>
              </div>
            )}

            {!isGenerating && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => fileInputRef.current?.click()}
                title="Attach code/document files"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            )}
            
            {/* Send/Cancel Button */}
            {isGenerating ? (
              <Button
                size="icon"
                className="h-9 w-9 rounded-lg bg-red-500 hover:bg-red-600 shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
                onClick={handleCancel}
              >
                <Square className="w-4 h-4 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-md shadow-primary/20 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                title={editingMessageId ? 'Update from this message' : 'Send'}
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground/70">
          <div className="flex items-center gap-4">
            <span className="shrink-0 flex items-center gap-1.5 font-medium">
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-sans border border-border/50">Ctrl</kbd>
              +
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-sans border border-border/50">Enter</kbd>
              to send
            </span>
            
            {draftSaved && (
              <motion.span 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 text-emerald-600"
              >
                <Save className="w-3 h-3" />
                Draft saved
              </motion.span>
            )}

            <span className="shrink-0">Mode: <strong className="text-foreground">{assistantMode === 'code' ? 'Code Editing' : 'Conversation'}</strong></span>
          </div>
          
          {activeFile && (
            <span className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1.5 rounded-full font-medium border border-primary/20">
              <FileCode className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[200px]">{activeFile.split(/[\\/]/).pop()}</span>
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
