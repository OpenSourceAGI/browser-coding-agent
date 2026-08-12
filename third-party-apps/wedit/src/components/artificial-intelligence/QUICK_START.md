# Quick Start Guide - Enhanced AIPanel

## 🚀 What Changed?

Your AIPanel just got a major upgrade inspired by Claudix! Same functionality, better UX.

## ✨ New Features You'll Notice

### 1. Better Looking Messages
Messages now have status indicators:
- ✓ Green check = Success
- ⨯ Red X = Error  
- ⟳ Spinner = Running

### 2. File Attachments
Click the 📎 button or paste images directly into the chat!

### 3. Token Counter
See exactly how much of your context window you've used with a color-coded progress bar.

### 4. Prettier UI
- Smoother animations
- Better spacing
- Cleaner icons
- Hover effects

## 📖 How to Use

### Starting a Conversation
1. Type your message in the input box
2. Press **Enter** to send (or click ▶)
3. Press **Shift+Enter** for new line

### Attaching Files
**Method 1:** Click the 📎 button
**Method 2:** Copy image and paste with Ctrl/Cmd+V
**Method 3:** Drag & drop (coming soon)

### Viewing Tool Calls
Click the ▼ arrow to expand tool execution details:
```
▼ read_file (path: "src/...")
  ├─ Shows the full result
  └─ Collapsed by default to save space
```

### Managing Context
Watch the token indicator in the bottom right:
- 🟢 Green bar = Plenty of space
- 🟡 Yellow bar = Getting full
- 🟠 Orange bar = Almost full
- 🔴 Red bar = Nearly at limit

## 🎯 Pro Tips

### Tip 1: Clear Old Messages
Click the **[+]** button (top right) to start fresh and free up context.

### Tip 2: Collapse Tool Calls
Tool results can be long! Keep them collapsed (▶) unless you need to see details.

### Tip 3: Monitor Token Usage
Hover over the token bar to see exact numbers: "12.5K / 200K"

### Tip 4: Stop Anytime
If a response is taking too long, click the stop button (◼)

## 🔧 Configuration

### Setting API Key
1. Click the 🔑 icon (top right)
2. Enter your OpenRouter API key
3. Get one at: https://openrouter.ai

### Choosing a Model
1. Click the model name (✨ model-name)
2. Search or scroll to find your preferred model
3. See pricing and context size for each

## 🎨 Visual Guide

```
┌─────────────────────────────────────────┐
│ 🤖 AI Assistant  ✨gpt-4o [🔑][+]      │ ← Header
├─────────────────────────────────────────┤
│                                         │
│  ╭──╮                                   │
│  │👤│ Your messages here                │ ← Messages
│  ╰──╯                                   │
│                                         │
│  ╭──╮                                   │
│  │🤖│ AI responses here                 │
│  ╰──╯                                   │
│                                         │
│  ╭──╮                                   │
│  │✓│ ▼ Tool calls (click to expand)    │ ← Tools
│  ╰──╯                                   │
│                                         │
├─────────────────────────────────────────┤
│  [file.txt ×]                           │ ← Attachments
│  ╭───────────────────────────────────╮  │
│  │ Type message...                   │  │ ← Input
│  ╰───────────────────────────────────╯  │
│  [📎]     [████░░] 45%          [▶]    │ ← Actions
└─────────────────────────────────────────┘
```

## ❓ Troubleshooting

### "No API key set"
→ Click the 🔑 icon and add your OpenRouter API key

### "Context window full"
→ Click [+] to start a new conversation

### Attachments not working
→ Make sure you're using a modern browser that supports file paste

### Tool calls look weird
→ Try expanding (▼) and collapsing (▶) them again

## 🆕 Coming Soon

- **/ Slash Commands** - Quick access to common actions
- **@ File Mentions** - Reference files in your workspace
- **Permission Modes** - Control what the AI can do
- **Thinking Blocks** - See Claude's reasoning process
- **Session History** - Switch between conversations

## 📚 Learn More

- [Full README](./README.md) - Complete documentation
- [Features Guide](./FEATURES.md) - Visual feature guide  
- [Integration Summary](./INTEGRATION_SUMMARY.md) - Technical details

## 🐛 Found a Bug?

Report issues or suggest features in the Wedit repository!

---

**Enjoy your enhanced AI assistant! 🎉**

*Inspired by [Claudix](https://github.com/Haleclipse/Claudix)*
