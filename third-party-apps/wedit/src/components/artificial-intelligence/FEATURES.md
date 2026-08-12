# Claudix-Inspired Features in Wedit AIPanel

## 🎨 Visual Enhancements

### Message Bubbles
**Before**: Simple text with basic icons
```
👤 Hello
🤖 Hi there!
```

**After**: Rich bubbles with status, hover effects, and timestamps
```
╭──────╮
│  👤  │ Hello                                     10:30 AM
╰──────╯

╭──────╮
│  🤖  │ Hi there! How can I help?                10:30 AM
╰──────╯
```

### Tool Call Display
**Before**: Basic collapsible text
```
🔧 read_file (path: "src/index.ts")
   Result: export const App = ...
```

**After**: Status-aware with visual indicators
```
╭──────╮ 
│  ✓   │ ▼ read_file
╰──────╯    path: "src/index.ts"
           ┌─────────────────────────────────┐
           │ export const App = () => {      │
           │   return <div>Hello</div>       │
           │ }                               │
           └─────────────────────────────────┘

╭──────╮ 
│  ⟳   │ ▼ write_file                   (running)
╰──────╯    path: "src/new.ts", content: ...

╭──────╮ 
│  ⨯   │ ▼ delete_file                  (error)
╰──────╯    Error: Permission denied
```

## 📎 File Attachments

### Attachment Pills
```
┌─────────────────────────────────────────┐
│  📄 document.pdf  [2.1MB]  [×]          │
│  🖼️ screenshot.png  [450KB]  [×]        │
│  📝 notes.txt  [12KB]  [×]              │
└─────────────────────────────────────────┘
```

### Features
- Click to attach
- Paste images directly
- Hover to see details
- One-click removal
- File type icons

## 📊 Token Usage Indicator

### Visual Progress
```
Context Usage:  [████████▓▓▓▓░░░░░░] 52.3%
                 12.5K / 200K tokens

Colors:
Green   (0-50%)   [████████░░░░░░░░░░]
Yellow  (50-75%)  [████████████▓▓░░░░]
Orange  (75-90%)  [████████████████▓▓]
Red     (90-100%) [██████████████████]
```

### Display Modes
- Compact: `12.5K / 200K`
- Percentage: `52.3%`
- Bar only: Progress visualization
- Tooltip: Full details on hover

## 🎯 Input Area Enhancements

### Smart Placeholder
```
┌────────────────────────────────────────┐
│ Ask the AI to help...                  │
│ @ for files, / for commands            │  ← Contextual hints
└────────────────────────────────────────┘
```

### Action Bar
```
[📎]  Attach       Token Usage       [◼]  Stop
[📎]  Attach     [███▓░] 45%        [▶]  Send
```

## 🎨 Color Scheme (Claudix-Inspired)

### Message Types
- **User**: Blue accent (`accent/15` background)
- **Assistant**: Purple (`purple/15` background)
- **Success**: Green (`green-500/15`)
- **Error**: Red (`red-500/15`)
- **Running**: Orange (`warning/15`)

### UI Elements
```css
/* Backgrounds */
bg-bg0:  Base background
bg-bg1:  Slightly elevated
bg-bg2:  Input fields
bg-bg3:  Hover states

/* Text */
text-t1: Primary text
text-t2: Secondary text
text-t3: Tertiary text
text-t4: Muted text
text-t5: Very muted
text-t6: Disabled

/* Accents */
accent:  Blue highlights
purple:  AI/assistant
warning: Running/pending
```

## 🔄 Loading States

### Message Streaming
```
╭──────╮
│  🤖  │ Let me help you with that█
╰──────╯
        ↑ Animated cursor
```

### Tool Execution
```
╭──────╮ 
│  ⟳   │ ▼ read_file
╰──────╯    Executing...
        ↑ Spinning icon
```

### Empty State
```
┌─────────────────────────────────────┐
│                                     │
│            🤖                       │
│                                     │
│      Start a conversation           │
│                                     │
│  Ask questions, write code, or      │
│  get help with tasks                │
│                                     │
└─────────────────────────────────────┘
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Cmd/Ctrl+V` | Paste (including images) |
| `Escape` | Cancel (when streaming) |

## 🎭 Animation & Transitions

### Smooth Interactions
- **Hover**: 150ms ease transition
- **Click**: Instant feedback with visual press
- **Scroll**: Smooth auto-scroll to new messages
- **Expand/Collapse**: 200ms ease-out
- **Token Bar**: 300ms width transition

### Micro-interactions
```
Button Hover:   bg-transparent → bg-hover
Tool Expand:    ▶ → ▼ (rotate 90deg)
Status Change:  Running ⟳ → Success ✓ (fade + scale)
New Message:    Fade in from bottom
```

## 📱 Responsive Design

### Adaptations
```
Desktop (>768px):
├─ Full model selector
├─ Side-by-side actions
└─ Wide input area

Mobile (<768px):
├─ Compact model name
├─ Stacked actions
└─ Full-width input
```

## 🔮 Future Features (Roadmap)

### Slash Commands (`/`)
```
Type: /read
╭────────────────────────────╮
│ /read                      │ ← Matched commands
│ /read-file                 │
│ /readme                    │
╰────────────────────────────╯
```

### File Mentions (`@`)
```
Type: @src/
╭────────────────────────────╮
│ 📁 src/components/         │ ← File browser
│ 📁 src/lib/                │
│ 📄 src/index.ts            │
╰────────────────────────────╯
```

### Permission Modes
```
┌─────────────────────────────┐
│ Mode: ▼ Default             │
│   • Default                 │
│   • Allow All               │
│   • Ask Each Time           │
│   • Deny All                │
└─────────────────────────────┘
```

### Thinking Blocks
```
╭──────────────────────────────╮
│ 💭 Claude is thinking...    │
│                              │
│ Let me analyze the code...   │
│ I notice this pattern...     │
│ The best approach is...      │
╰──────────────────────────────╯
```

### Image Rendering
```
╭─────────────────╮
│  🤖  │ Here's a │
╰──────┘ diagram: │
  ┌──────────────┐
  │ [Image]      │
  │  Chart.png   │
  │  1024x768    │
  └──────────────┘
```

## 🎁 Bonus Features

### Copy Code Blocks
```typescript
// Hover to reveal copy button
export const App = () => {     [📋 Copy]
  return <div>Hello</div>
}
```

### Message Actions (Planned)
```
╭──────╮
│  🤖  │ Here's the code...
╰──────╯  👍 👎 🔄 📋
         ↑  ↑  ↑  ↑
       Like|Retry|Copy
```

### Export Conversation (Planned)
```
📥 Export As:
   • Markdown (.md)
   • JSON (.json)
   • PDF (.pdf)
   • Plain Text (.txt)
```

## 📚 Component Reference

### MessageBubble
```tsx
<MessageBubble 
  message={{
    kind: "text",
    role: "assistant",
    content: "Hello!",
    timestamp: Date.now()
  }}
/>
```

### ToolCallBlock
```tsx
<ToolCallBlock 
  message={{
    kind: "tool_call",
    callId: "call_123",
    name: "read_file",
    args: '{"path": "src/app.ts"}',
    result: "export const...",
    status: "success",
    collapsed: false
  }}
/>
```

### AttachmentPill
```tsx
<AttachmentPill 
  attachment={{
    id: "att_1",
    fileName: "document.pdf",
    fileSize: 2100000,
    mimeType: "application/pdf"
  }}
  onRemove={(id) => console.log(`Remove ${id}`)}
/>
```

### TokenIndicator
```tsx
<TokenIndicator 
  percentage={52.3}
  totalTokens={12500}
  contextWindow={200000}
  tooltip="Context usage"
/>
```

### InputArea
```tsx
<InputArea 
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  onStop={handleStop}
  onAttach={handleAttach}
  isRunning={false}
  attachments={[...]}
  tokenPercentage={52.3}
/>
```

---

**All features designed with Claudix's polish and attention to detail! 🎨**
