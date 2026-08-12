# AI Panel - Claudix Integration

Enhanced AI assistant panel inspired by [Claudix](https://github.com/Haleclipse/Claudix), bringing polished UI/UX patterns and features to Wedit's AI interface.

## Features

### ✨ Enhanced from Claudix

- **Better Message Rendering**: Improved text and tool call display with status indicators
- **Tool Call Visualization**: Collapsible tool blocks with running/success/error states
- **File Attachments**: Support for attaching files with visual pills
- **Token Usage Indicator**: Real-time context window usage with color-coded progress bar
- **Polished UI**: Clean, modern interface with smooth animations and better spacing
- **Timestamp Display**: Optional message timestamps (shown on hover)

### 🚀 Component Structure

```
artificial-intelligence/
├── AIPanel.tsx                  # Main export (uses Enhanced version)
├── AIPanel-Enhanced.tsx         # New enhanced implementation
├── AIPanel-Legacy.tsx           # Original implementation (backup)
├── types.ts                     # Shared TypeScript types
├── components/
│   ├── MessageBubble.tsx        # Message display component
│   ├── ToolCallBlock.tsx        # Tool call visualization
│   ├── InputArea.tsx            # Enhanced input with attachments
│   ├── TokenIndicator.tsx       # Token usage display
│   └── AttachmentPill.tsx       # File attachment pills
└── README.md                    # This file
```

## Usage

### Basic Usage

The AIPanel is automatically used in Wedit. Import it as usual:

```tsx
import { AIPanel } from '@/components/artificial-intelligence/AIPanel';

function MyApp() {
  return <AIPanel />;
}
```

### Using the Legacy Version

If you need the original implementation:

```tsx
import { AIPanel } from '@/components/artificial-intelligence/AIPanel-Legacy';
```

## Key Improvements

### 1. Message Rendering

**Before (Legacy)**:
- Simple text bubbles
- Basic tool call display
- No status indicators

**After (Enhanced)**:
- Rich message bubbles with icons
- Status-aware tool calls (running/success/error)
- Timestamps on hover
- Better text formatting and spacing

### 2. Tool Call Visualization

```tsx
// Tool calls now show:
- ✓ Green check for successful completion
- ⨯ Red X for errors
- ⟳ Spinner for running tools
- Collapsible details with formatted results
```

### 3. File Attachments

```tsx
// Users can now:
- Paste images/files directly into the input
- Click attach button to select files
- See file previews as removable pills
- Drag and drop files (coming soon)
```

### 4. Token Usage

```tsx
// Real-time context tracking:
- Visual progress bar
- Color coding (green → yellow → orange → red)
- Hover tooltip with exact numbers
- Format: "12.5K / 200K"
```

## Claudix Features Ported

### From Claudix's ChatInputBox.vue
- ✅ Enhanced input area with better UX
- ✅ File attachment support with paste
- ✅ Attachment pills with icons
- ⏳ Slash command completion (TODO)
- ⏳ @ file mention completion (TODO)

### From Claudix's Message Components
- ✅ Status-aware tool call rendering
- ✅ Collapsible tool blocks
- ✅ Better text formatting
- ✅ Message timestamps
- ⏳ Thinking blocks (TODO)
- ⏳ Image blocks (TODO)

### From Claudix's ButtonArea.vue
- ✅ Token usage indicator
- ✅ Better model selector
- ⏳ Permission mode selector (TODO)
- ⏳ Thinking toggle (TODO)

## Future Enhancements

### High Priority
1. **Slash Command Completion** (`/` trigger)
   - Fuzzy search commands
   - Keyboard navigation
   - Similar to Claudix's implementation

2. **@ File Mentions** (`@` trigger)
   - File browser in dropdown
   - Quick file references
   - Path autocomplete

3. **Claude Agent SDK Integration**
   - Add as alternative to OpenRouter
   - Use Claudix's SDK patterns
   - Better tool handling

### Medium Priority
4. **Permission Mode UI**
   - Allow/deny controls
   - Mode selection dropdown
   - Visual permission indicators

5. **Thinking Blocks**
   - Display Claude's reasoning
   - Collapsible thinking sections
   - Similar to Claudix's ThinkingBlock

6. **Enhanced Message Types**
   - Image rendering
   - Document previews
   - Diagnostic displays

### Low Priority
7. **Session Management**
   - Multiple conversations
   - Session persistence
   - History sidebar

8. **Advanced Features**
   - Message editing
   - Regenerate responses
   - Export conversations

## Technical Notes

### Why Not Direct Vue Integration?

Claudix uses Vue 3, but Wedit uses React. Instead of adding Vue as a dependency, we:
1. Analyzed Claudix's component architecture
2. Ported the UI/UX patterns to React
3. Maintained similar component structure
4. Kept the same design language

### Type Safety

All components use TypeScript with strict types from `types.ts`:
- `UIMessage` - Union type for text and tool call messages
- `AttachmentItem` - File attachment metadata
- `CompletionItem` - For future autocomplete features

### Performance

- Uses React's built-in optimizations
- Memoized computations where appropriate
- Virtualized model list (from legacy)
- Smooth scrolling with requestAnimationFrame

## Credits

- **Claudix**: [github.com/Haleclipse/Claudix](https://github.com/Haleclipse/Claudix)
- **Original Wedit AIPanel**: Legacy implementation
- **Integration**: Enhanced version combining best of both

## License

Follows Wedit's license. Claudix patterns used under AGPL-3.0.
