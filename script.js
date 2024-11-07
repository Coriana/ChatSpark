document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const form = document.getElementById("chat-form");
    const chatHistory = document.querySelector(".chat-history");
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeButton = document.querySelector(".close-button");
    const settingsForm = document.getElementById("settings-form");
    const newChatBtn = document.getElementById("new-chat-btn");
    const loadingIndicator = document.getElementById("loading-indicator");
    const chatTitleElement = document.getElementById("chat-title");
    const sidebar = document.getElementById("sidebar");
    const sidebarclosed = document.getElementById("sidebarclosed");
    const closeSidebarBtn = document.getElementById("close-sidebar-btn");
    const openSidebarBtn = document.getElementById("open-sidebar-btn");
    const conversationList = document.getElementById("conversation-list");
    const exportChatBtn = document.getElementById("export-chat-btn");
    const regenerateTitleBtn = document.getElementById("regenerate-title-btn"); // New Button
        // Add Dark Mode Toggle Button Listener
    const darkModeToggle = document.getElementById("dark-mode-toggle");
    const body = document.body;
    // Chat State
    let conversations = {}; // Object to hold multiple conversations
    let currentConversationId = null;
    let chatTitleSet = false; // Flag to track if title has been set

    // Settings State
    let apiUrl = "";
    let apiKey = "";
    let selectedModel = "";

    // Prevent multiple event listener attachments
    let isEventListenerAttached = false;

    // Initialize Conversations
    loadConversations();
    loadSettings();
    loadCurrentConversation();

    // Attach Event Listeners Only Once
    if (!isEventListenerAttached) {
        attachEventListeners();
        isEventListenerAttached = true;
    }

    // Function to Attach Event Listeners
    function attachEventListeners() {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const searchContent = document.getElementById("search").value.trim();

            if (!searchContent) {
                alert("Please enter your query.");
                return;
            }

            addMessageToHistory("user", searchContent);
            updateChatHistory();
            scrollToBottom();

            // Show loading indicator
            showLoading();

            try {
                const botMessage = await fetchBotResponse(searchContent, getCurrentConversationMessages().slice(0, -1));
                addMessageToHistory("assistant", botMessage);
                updateChatHistory();
                scrollToBottom();

                // After the first user message and assistant response, prompt for chat title
                // Ensure this only happens once
                if (!chatTitleSet && getCurrentConversationMessages().length === 2) { // Only first interaction
                    await promptForChatTitle();
                }
            } catch (error) {
                console.error("Fetch Error:", error);
                // Differentiate between API errors and network errors
                if (error.message.startsWith("Error:")) {
                    addMessageToHistory("assistant", `API Error: ${error.message}`);
                } else {
                    addMessageToHistory("assistant", "A network error occurred. Please try again.");
                }
                updateChatHistory();
                scrollToBottom();
            }

            // Hide loading indicator
            hideLoading();

            // Clear the input field after submission
            document.getElementById("search").value = "";
        });

        closeSidebarBtn.addEventListener("click", () => {
            toggleSidebarVisibility();
        });


        // Check for saved dark mode preference in local storage and apply it
        if (localStorage.getItem("darkMode") === "enabled") {
            body.classList.add("dark-mode");
        }

        darkModeToggle.addEventListener("click", () => {
            body.classList.toggle("dark-mode");

            // Save the user's preference to localStorage
            if (body.classList.contains("dark-mode")) {
                localStorage.setItem("darkMode", "enabled");
            } else {
                localStorage.setItem("darkMode", "disabled");
            }
        });

        openSidebarBtn.addEventListener("click", () => {
            toggleSidebarVisibility();
        });

        settingsBtn.addEventListener("click", () => {
            openSettingsModal();
        });

        closeButton.addEventListener("click", () => {
            closeSettingsModal();
        });

        settingsForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveSettings();
            closeSettingsModal();
            alert("Settings saved successfully!");
        });

        newChatBtn.addEventListener("click", () => {
            startNewChat();
        });

        exportChatBtn.addEventListener("click", () => {
            openExportOptions();
        });

        regenerateTitleBtn.addEventListener("click", () => {
            regenerateChatTitle();
        });

        // Keyboard Shortcuts (e.g., Enter to send, Shift+Enter for newline)
        document.getElementById("search").addEventListener("keydown", function(event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });

        // Save edited chat title on blur
        chatTitleElement.addEventListener("blur", () => {
            const editedTitle = chatTitleElement.textContent.trim();
            if (editedTitle && editedTitle !== "ChatGPT Assistant") {
                updateConversationTitle(currentConversationId, editedTitle);
                chatTitleSet = true;
            } else {
                chatTitleElement.textContent = "ChatGPT Assistant";
                chatTitleSet = false;
            }
        });
    }

    /**
     * Adds a message to the current conversation history.
     * Prevents duplicate consecutive messages.
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - The message content
     */
    function addMessageToHistory(role, content) {
        if (!currentConversationId) {
            alert("No active conversation. Please start a new chat.");
            return;
        }

        const conversation = conversations[currentConversationId].messages;

        // Prevent duplicate messages
        if (conversation.length > 0) {
            const lastMessage = conversation[conversation.length -1];
            if (lastMessage.role === role && lastMessage.content === content) {
                console.warn(`Duplicate message detected. Skipping addition - Role: ${role}, Content: ${content}`);
                return;
            }
        }
        console.log(`Adding message - Role: ${role}, Content: ${content}`);
        conversation.push({ role, content });
        saveConversations();
    }

    /**
     * Updates the chat history UI with the current conversation.
     */
    function updateChatHistory() {
        if (!currentConversationId) return;

        const conversation = conversations[currentConversationId].messages;
        chatHistory.innerHTML = "";
        conversation.forEach((msg, index) => {
            const messageElement = document.createElement("div");
            messageElement.classList.add("message", msg.role.toLowerCase());

            // Message content
            const messageContent = document.createElement("div");
            messageContent.classList.add("message-content");
            messageContent.innerHTML = `
                <strong>${capitalizeFirstLetter(msg.role)}:</strong> ${sanitizeHTML(msg.content)}
                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
            `;
            messageElement.appendChild(messageContent);

            // Action buttons
            if (msg.role.toLowerCase() === "user" || msg.role.toLowerCase() === "assistant") {
                const actionsDiv = document.createElement("div");
                actionsDiv.classList.add("message-actions");

                // Delete Button
                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "Delete";
                deleteBtn.title = "Delete Message";
                deleteBtn.addEventListener("click", () => deleteMessage(index));
                actionsDiv.appendChild(deleteBtn);

                // Regenerate Button for Assistant messages (excluding the title)
                if (msg.role.toLowerCase() === "assistant" && !(chatTitleSet && index === conversation.length -1)) {
                    const regenBtn = document.createElement("button");
                    regenBtn.textContent = "Regenerate";
                    regenBtn.classList.add("regenerate-btn");
                    regenBtn.title = "Regenerate Response";
                    regenBtn.addEventListener("click", () => regenerateMessage(index));
                    actionsDiv.appendChild(regenBtn);
                }

                messageElement.appendChild(actionsDiv);
            }

            chatHistory.appendChild(messageElement);
        });
    }

    /**
     * Deletes a message from the conversation.
     * Handles deletion of chat title if applicable.
     * @param {number} index - Index of the message to delete
     */
    function deleteMessage(index) {
        if (!currentConversationId) return;

        const conversation = conversations[currentConversationId].messages;
        const msg = conversation[index];
        if (msg.role.toLowerCase() === "user") {
            // Remove user message
            conversation.splice(index, 1);
            // Remove corresponding assistant message if exists
            if (conversation[index] && conversation[index].role.toLowerCase() === "assistant") {
                // Check if the assistant message is the chat title
                if (chatTitleSet && index === conversation.length -1) {
                    // If it's the title, reset the title
                    chatTitleElement.textContent = "ChatGPT Assistant";
                    chatTitleSet = false;
                }
                conversation.splice(index, 1);
            }
        } else if (msg.role.toLowerCase() === "assistant") {
            // Remove assistant message
            if (chatTitleSet && index === conversation.length -1) {
                // If it's the title, reset the title
                chatTitleElement.textContent = "ChatGPT Assistant";
                chatTitleSet = false;
            }
            conversation.splice(index, 1);
        }
        updateChatHistory();
        saveConversations();
    }

    /**
     * Regenerates an assistant's message.
     * Prevents regeneration of the chat title.
     * @param {number} index - Index of the assistant message to regenerate
     */
    async function regenerateMessage(index) {
        if (!currentConversationId) return;

        const conversation = conversations[currentConversationId].messages;

        if (conversation[index].role.toLowerCase() !== "assistant") return;

        // Check if this assistant message is the title
        if (chatTitleSet && index === conversation.length -1) {
            alert("Cannot regenerate the chat title.");
            return;
        }

        const userMessage = conversation[index -1];
        if (!userMessage || userMessage.role.toLowerCase() !== "user") {
            alert("Cannot find corresponding user message for regeneration.");
            return;
        }

        // Show loading indicator
        showLoading();

        try {
            // Slice up to the user message to avoid including the title prompt
            const priorConversation = conversation.slice(0, index -1);
            const newBotMessage = await fetchBotResponse(userMessage.content, priorConversation);
            addMessageToHistory("assistant", newBotMessage);
            // Remove the old assistant message
            conversation.splice(index, 1);
            updateChatHistory();
            scrollToBottom();
            saveConversations();
        } catch (error) {
            console.error("Regeneration Error:", error);
            addMessageToHistory("assistant", "An error occurred while regenerating the response.");
            updateChatHistory();
            scrollToBottom();
        }

        // Hide loading indicator
        hideLoading();
    }

    /**
     * Fetches a response from the AI API.
     * @param {string} userInput - The user's message
     * @param {Array} priorConversation - The conversation history
     * @returns {Promise<string>} - The assistant's response
     */
    async function fetchBotResponse(userInput, priorConversation = []) {
        if (!apiUrl) {
            throw new Error("API URL is not set.");
        }

        // Debugging: Log the conversation roles
        console.log("Preparing to send conversation to API:");
        priorConversation.forEach((msg, idx) => {
            console.log(`${idx + 1}. Role: ${msg.role}, Content: ${msg.content}`);
        });

        const payload = {
            model: selectedModel || "gpt-4",
            messages: [
                ...priorConversation.map(msg => ({ role: msg.role.toLowerCase(), content: msg.content })),
                { role: "user", content: userInput }
            ],
            max_tokens: 2000,
        };

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey && { "Authorization": `Bearer ${apiKey}` }),
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const botMessage = data.choices && data.choices[0] && data.choices[0].message.content
            ? data.choices[0].message.content
            : "No response received.";

        return botMessage;
    }

    /**
     * Prompts the assistant to suggest a chat title based on the first user message.
     */
    async function promptForChatTitle() {
        if (!apiUrl) return;

        const titlePrompt = "Give a VERY short title for this conversation. Do not give explanations or preamble, just give the title and nothing else.";

        try {
            const botTitle = await fetchBotResponse(titlePrompt, conversations[currentConversationId].messages);
            chatTitleElement.textContent = botTitle;
            updateConversationTitle(currentConversationId, botTitle);
            chatTitleSet = true; // Set the flag to prevent future prompts
            updateChatHistory();
            scrollToBottom();
            saveConversations();
            updateConversationListUI();
        } catch (error) {
            console.error("Title Generation Error:", error);
            addMessageToHistory("assistant", "Failed to generate chat title.");
            updateChatHistory();
            scrollToBottom();
        }
    }

    /**
     * Toggles the visibility of the sidebar.
     */
    function toggleSidebarVisibility() {
        sidebar.classList.toggle("hidden");
        sidebarclosed.classList.toggle("hidden");
    }

    /**
     * Opens the settings modal.
     */
    function openSettingsModal() {
        settingsModal.classList.remove("hidden");
        // Focus on the first input for accessibility
        document.getElementById("api-url").focus();
    }

    /**
     * Closes the settings modal.
     */
    function closeSettingsModal() {
        settingsModal.classList.add("hidden");
    }

    /**
     * Saves settings from the settings form to localStorage.
     */
    function saveSettings() {
        const apiUrlInput = document.getElementById("api-url").value.trim();
        const apiKeyInput = document.getElementById("api-key").value.trim();
        const modelInput = document.getElementById("model-input").value.trim();

        if (!apiUrlInput) {
            alert("API URL is required.");
            return;
        }

        if (!modelInput) {
            alert("Model name is required.");
            return;
        }

        apiUrl = apiUrlInput;
        apiKey = apiKeyInput;
        selectedModel = modelInput;

        // Save settings to localStorage
        localStorage.setItem("apiUrl", apiUrl);
        localStorage.setItem("apiKey", apiKey);
        localStorage.setItem("selectedModel", selectedModel);

        // Save chat title if edited
        const editedTitle = chatTitleElement.textContent.trim();
        if (editedTitle && editedTitle !== "ChatGPT Assistant") {
            updateConversationTitle(currentConversationId, editedTitle);
        } else {
            chatTitleElement.textContent = "ChatGPT Assistant";
            chatTitleSet = false;
        }

        saveConversations();
    }

    /**
     * Loads settings from localStorage.
     */
    function loadSettings() {
        apiUrl = localStorage.getItem("apiUrl") || "";
        apiKey = localStorage.getItem("apiKey") || "";
        selectedModel = localStorage.getItem("selectedModel") || "";
        const savedTitle = localStorage.getItem("chatTitle") || "";

        if (savedTitle && savedTitle !== "ChatGPT Assistant") {
            chatTitleElement.textContent = savedTitle;
            chatTitleSet = true; // Assume title is already set
        }

        if (!apiUrl || !selectedModel) {
            // If settings are not saved, prompt the user to open the settings modal
            openSettingsModal();
        }
    }

    /**
     * Saves all conversations to localStorage.
     */
    function saveConversations() {
        localStorage.setItem("conversations", JSON.stringify(conversations));
        localStorage.setItem("currentConversationId", currentConversationId);
    }

    /**
     * Loads all conversations from localStorage.
     */
    function loadConversations() {
        const savedConversations = JSON.parse(localStorage.getItem("conversations"));
        if (savedConversations && typeof savedConversations === "object") {
            conversations = savedConversations;
        }
    }

    /**
     * Loads the current conversation based on localStorage or creates a new one.
     */
    function loadCurrentConversation() {
        const savedConversationId = localStorage.getItem("currentConversationId");
        if (savedConversationId && conversations[savedConversationId]) {
            currentConversationId = savedConversationId;
        } else {
            createNewConversation();
        }
        updateChatTitle();
        updateChatHistory();
        updateConversationListUI();
    }

    /**
     * Creates a new conversation and sets it as current.
     */
    function createNewConversation() {
        const newId = generateUniqueId();
        const defaultTitle = "New Conversation";
        conversations[newId] = {
            id: newId,
            title: defaultTitle,
            messages: []
        };
        currentConversationId = newId;
        chatTitleElement.textContent = defaultTitle;
        chatTitleSet = false;
        saveConversations();
        updateConversationListUI();
    }

    /**
     * Starts a new chat by creating a new conversation.
     */
    function startNewChat() {
        //if (confirm("Are you sure you want to start a new chat? This will clear the current conversation.")) {
        createNewConversation();
        updateChatHistory();
        saveConversations();
        //}
    }

    /**
     * Generates a unique identifier for conversations.
     * @returns {string} - A unique ID
     */
    function generateUniqueId() {
        return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Updates the chat title in the UI based on the current conversation.
     */
    function updateChatTitle() {
        if (!currentConversationId) return;

        const conversation = conversations[currentConversationId];
        if (conversation.title) {
            chatTitleElement.textContent = conversation.title;
            chatTitleSet = conversation.title !== "ChatGPT Assistant";
        } else {
            chatTitleElement.textContent = "ChatGPT Assistant";
            chatTitleSet = false;
        }
    }

    /**
     * Updates the conversation title in the data structure.
     * @param {string} conversationId - The ID of the conversation to update
     * @param {string} newTitle - The new title
     */
    function updateConversationTitle(conversationId, newTitle) {
        if (conversations[conversationId]) {
            conversations[conversationId].title = newTitle;
            saveConversations();
            updateConversationListUI();
        }
    }

    /**
     * Updates the UI list of conversations in the sidebar.
     */
    function updateConversationListUI() {
        conversationList.innerHTML = "";
        for (const id in conversations) {
            const convo = conversations[id];
            const li = document.createElement("li");
            li.classList.add("conversation-item");
            if (id === currentConversationId) {
                li.classList.add("active");
            }

            li.innerHTML = `
                <span>${sanitizeHTML(convo.title)}</span>
                <div class="conversation-actions">
                    <button class="rename-btn" title="Rename Conversation">✏️</button>
                    <button class="delete-btn" title="Delete Conversation">🗑️</button>
                </div>
            `;

            // Event listener for selecting a conversation
            li.querySelector("span").addEventListener("click", () => {
                if (id !== currentConversationId) {
                    currentConversationId = id;
                    saveConversations();
                    updateChatTitle();
                    updateChatHistory();
                    updateConversationListUI();
                }
            });

            // Event listener for renaming a conversation
            li.querySelector(".rename-btn").addEventListener("click", () => {
                const newTitle = prompt("Enter new conversation title:", convo.title);
                if (newTitle && newTitle.trim()) {
                    updateConversationTitle(id, newTitle.trim());
                }
            });

            // Event listener for deleting a conversation
            li.querySelector(".delete-btn").addEventListener("click", () => {
                if (confirm(`Are you sure you want to delete the conversation "${convo.title}"?`)) {
                    delete conversations[id];
                    // If the deleted conversation was current, load another
                    if (id === currentConversationId) {
                        const remainingIds = Object.keys(conversations);
                        currentConversationId = remainingIds.length > 0 ? remainingIds[0] : null;
                        if (currentConversationId) {
                            updateChatTitle();
                            updateChatHistory();
                        } else {
                            createNewConversation();
                        }
                    }
                    saveConversations();
                    updateConversationListUI();
                }
            });

            conversationList.appendChild(li);
        }
    }

    /**
     * Gets the messages of the current conversation.
     * @returns {Array} - Array of message objects
     */
    function getCurrentConversationMessages() {
        if (!currentConversationId) return [];
        return conversations[currentConversationId].messages;
    }

    /**
     * Scrolls the chat history to the bottom.
     */
    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    /**
     * Capitalizes the first letter of a string.
     * @param {string} string - The string to capitalize
     * @returns {string} - The capitalized string
     */
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /**
     * Shows the loading indicator.
     */
    function showLoading() {
        loadingIndicator.classList.remove("hidden");
    }

    /**
     * Hides the loading indicator.
     */
    function hideLoading() {
        loadingIndicator.classList.add("hidden");
    }

    /**
     * Sanitizes HTML to prevent XSS attacks.
     * @param {string} str - The string to sanitize
     * @returns {string} - The sanitized string
     */
    function sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    /**
     * Prevent the settings modal from closing when clicking inside the modal content
     */
    settingsModal.addEventListener("click", (event) => {
        if (event.target === settingsModal) {
            closeSettingsModal();
        }
    });

    /**
     * Opens export options for the current conversation.
     */
    function openExportOptions() {
        if (!currentConversationId) {
            alert("No active conversation to export.");
            return;
        }

        const exportChoice = prompt("Enter export format:\n1. Markdown\n2. JSON", "1");
        if (exportChoice === "1") {
            exportToMarkdown();
        } else if (exportChoice === "2") {
            exportToJSON();
        } else {
            alert("Invalid choice.");
        }
    }

    /**
     * Exports the current conversation to a Markdown file.
     */
    function exportToMarkdown() {
        const conversation = conversations[currentConversationId];
        if (!conversation) return;

        let markdownContent = `# ${sanitizeMarkdown(conversation.title)}\n\n`;

        conversation.messages.forEach(msg => {
            const role = capitalizeFirstLetter(msg.role);
            const content = sanitizeMarkdown(msg.content);
            markdownContent += `**${role}:** ${content}\n\n`;
        });

        downloadFile(`${sanitizeFilename(conversation.title)}.md`, markdownContent);
    }

    /**
     * Exports the current conversation to a JSON file.
     */
    function exportToJSON() {
        const conversation = conversations[currentConversationId];
        if (!conversation) return;

        const jsonContent = JSON.stringify(conversation, null, 2);
        downloadFile(`${sanitizeFilename(conversation.title)}.json`, jsonContent);
    }

    /**
     * Triggers a download of a file with the given content.
     * @param {string} filename - The name of the file
     * @param {string} content - The content of the file
     */
    function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Sanitizes a string for use in filenames by removing or replacing invalid characters.
     * @param {string} filename - The original filename
     * @returns {string} - The sanitized filename
     */
    function sanitizeFilename(filename) {
        return filename.replace(/[^a-z0-9_\-\.]/gi, '_');
    }

    /**
     * Sanitizes a string for Markdown by escaping special characters.
     * @param {string} text - The original text
     * @returns {string} - The sanitized text
     */
    function sanitizeMarkdown(text) {
        return text.replace(/([_*~`])/g, '\\$1');
    }

    /**
     * Re-generates the conversation title.
     */
    async function regenerateChatTitle() {
        if (!currentConversationId) {
            alert("No active conversation.");
            return;
        }

        // Show loading indicator
        showLoading();

        const titlePrompt = "Please suggest a new suitable title for this conversation based on its content.";

        try {
            const botTitle = await fetchBotResponse(titlePrompt, getCurrentConversationMessages());
            chatTitleElement.textContent = botTitle;
            updateConversationTitle(currentConversationId, botTitle);
            chatTitleSet = true; // Set the flag
            updateChatHistory();
            scrollToBottom();
            saveConversations();
            updateConversationListUI();
        } catch (error) {
            console.error("Title Regeneration Error:", error);
            addMessageToHistory("assistant", "Failed to regenerate chat title.");
            updateChatHistory();
            scrollToBottom();
        }

        // Hide loading indicator
        hideLoading();
    }
});
