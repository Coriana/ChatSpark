# ChatSpark

**ChatSpark** is your personal AI chat companion that works with any OpenAI-compatible backend. It's a fully self-contained browser app — no build step, no server, no accounts — designed to make conversations with AI feel natural and enjoyable.

## What makes ChatSpark special?

ChatSpark was built with the belief that talking to AI should be simple and pleasant. Whether you're using it for creative writing, problem-solving, or just casual conversation, ChatSpark gives you:

- A distraction-free interface that feels like texting a friend
- Streaming responses with a Stop button — no more staring at a spinner
- Dark mode that's easy on your eyes during late-night sessions
- Complete privacy with all data stored locally on your device

## Features

- **Connections & Models**: Add any OpenAI-compatible endpoint (OpenAI, llama.cpp, Ollama, LM Studio, vLLM…), fetch its model list automatically, and manage everything from a tabbed settings panel
- **Switch models mid-conversation**: A model picker lives right in the header; every response is tagged with the model that wrote it
- **Streaming responses**: Replies render token-by-token with proper Markdown — headings, lists, tables, and syntax-highlighted code blocks with copy buttons
- **Image support**: Attach, paste, or drag & drop images into the chat (sent using the OpenAI vision format; large images are downscaled automatically)
- **System prompts**: Set a global default and override it per conversation
- **Edit & regenerate**: Edit any of your messages and resend, or regenerate any assistant response in place — with a different model if you like
- **Conversation management**: Auto-generated titles, folders, search, and per-chat export to Markdown or JSON
- **Backup & restore**: Export all data to a single JSON file and import it on another machine
- **Roomy storage**: Conversations (including images) live in IndexedDB, not the cramped 5 MB localStorage — existing chats are migrated automatically

## Quick Start

1. **Get it running:**
   ```bash
   git clone https://github.com/yourusername/ChatSpark.git
   cd ChatSpark
   ```
   Then simply open `index.html` in your browser (or serve the folder with any static file server).

2. **Connect to your AI:**
   - The settings panel opens automatically on first run (or click ⚙️)
   - Add a connection: name it, enter the API base URL (e.g. `https://api.openai.com/v1`), and your key if the server needs one
   - Click **Fetch Models** to pull the model list (or add model ids manually), then **Save**

3. **Start chatting:**
   - Pick a model from the dropdown in the header
   - Type your message and press Enter (Shift+Enter for a newline)
   - Attach images with 📎, by pasting, or by dropping them onto the chat

4. **Make it yours:**
   - Set a default system prompt, temperature, and max tokens in Settings → Chat
   - Override the system prompt for any single chat with the 📝 button
   - Organize conversations into folders and find them again with search

## Behind the Scenes

ChatSpark is built with vanilla web technologies:

- **HTML/CSS/JavaScript** — no framework, no build step
- **IndexedDB** for conversations and images, **localStorage** for settings
- Vendored [marked](https://github.com/markedjs/marked), [DOMPurify](https://github.com/cure53/DOMPurify), and [highlight.js](https://github.com/highlightjs/highlight.js) for safe, pretty Markdown rendering — still fully offline

Your API keys are stored unencrypted in your browser's local storage and are only ever sent to the endpoints you configure. All conversation data stays on your device.

## Making ChatSpark Your Own

- Edit `style.css` to transform the visual experience
- Modify `script.js` to change behaviors or add new features
- All your changes stay local — no data leaves your computer

## Join the Community

Found a bug? Have an idea for an improvement? Want to contribute code?

- Open an issue or submit a pull request on GitHub
- Share how you're using ChatSpark
- Let us know what features would make your experience better

## License

ChatSpark is available under the Apache License 2.0. Feel free to use, modify, and share it!

---

Made with ❤️ for better AI conversations
