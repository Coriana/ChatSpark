# ChatSpark

**ChatSpark**: A modern, customizable LLM interface for seamless conversations with OpenAI compatible backends, featuring dark mode, conversation export, and intuitive management tools.

## Project Overview
ChatSpark presents a modern, responsive ChatGPT user interface designed to enhance user interaction with OpenAI's conversational models. It focuses on providing a clean and intuitive experience, incorporating dark mode, dynamic conversation handling, and export capabilities for conversations. The interface is built using a combination of HTML, CSS, and JavaScript, enabling seamless integration with OpenAI-compatible APIs.

## Features
- **Editable Chat Title**: Allows users to personalize each conversation by editing the chat title directly.
- **Dark Mode Toggle**: Users can switch between light and dark modes, with their preference saved locally.
- **Sidebar for Conversations**: The interface has a sidebar to manage ongoing or previous conversations, which can be opened or closed as needed.
- **Conversation Management**: Users can start new conversations, regenerate responses, rename, or delete existing chats.
- **Settings Modal**: Provides a settings panel for configuring API details, including URL and API key input, which are securely stored locally.
- **Loading Indicator**: Displays an indicator while the assistant generates a response, improving the user experience.
- **Export Options**: Conversations can be exported as Markdown or JSON files.

## Project Structure
- **HTML (index.html)**: Defines the structure of the user interface, including the header, main chat area, and the sidebar. It also includes a modal for managing settings and uses semantic HTML for accessibility.
- **CSS (style.css)**: Manages the visual styling, ensuring a polished, modern look. Includes responsive styles, dark mode, and various UI component styles, such as the chat messages, sidebar, and header.
- **JavaScript (script.js)**: Handles the dynamic aspects of the application, including conversation management, dark mode toggling, and API interactions. It ensures state persistence using `localStorage`, manages UI updates, and supports various chat-related actions such as exporting and message regeneration.

## How to Use
1. **Setup API Access**:
   - Open the settings modal by clicking the settings icon in the sidebar.
   - Enter your OpenAI-compatible API URL and API key.
   - Save your settings to proceed.

2. **Start Chatting**:
   - Type your message into the chat input field and press **Send** to start the conversation.
   - The chat title can be edited by clicking on it, making it easy to distinguish conversations.

3. **Manage Conversations**:
   - Use the sidebar to view past conversations, start a new chat, or rename/delete an existing conversation.
   - The sidebar can be opened or closed using the designated buttons.

4. **Export Chats**:
   - Conversations can be exported by clicking the **Export Current Chat** button. Choose between exporting as Markdown or JSON.

5. **Toggle Dark Mode**:
   - Click the **Toggle Dark Mode** button in the header to switch between themes.

## Dependencies
- **Local Font**: Replaced `Roboto` with a local, open source font for typography.
- **Font Awesome**: Provides icons for UI elements like buttons.
- **OpenAI API**: This project requires an API key and URL for accessing OpenAI's models.

## Customization
- **Styles**: You can modify `style.css` to change the visual aesthetics of the interface.
- **JavaScript Logic**: Update `script.js` to enhance or modify chat functionalities, such as integrating more complex conversation management or adding new export formats.

## Getting Started
1. Clone the repository:
   ```bash
   git clone <repository_url>
   cd modern-chatgpt-interface
   ```
2. Open `index.html` in a web browser to start using the application.

## Roadmap
- **Add More Export Options**: PDF support for exporting conversations.
- **Multi-User Support**: Allow multiple users to have separate chat sessions on the same interface.
- **Better Accessibility**: Improving ARIA labels and keyboard navigation for users with accessibility needs.

## Key Takeaways
- Simple setup and usage for interacting with OpenAI models.
- Dynamic and customizable interface designed to enhance the user experience.
- Robust conversation management and export options.
- Dark mode to cater to user preferences.

Feel free to contribute to ChatSpark by submitting pull requests or opening issues for new features and bug fixes.