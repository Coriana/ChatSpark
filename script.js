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
    const darkModeToggle = document.getElementById("dark-mode-toggle");
    const body = document.body;
    const searchInput = document.getElementById("search");
    const submitBtn = document.getElementById("submit-btn");
    const modelSelect = document.getElementById("model-select");
    const newModelNameInput = document.getElementById("new-model-name");
    const newModelUrlInput = document.getElementById("new-model-url");
    const newModelKeyInput = document.getElementById("new-model-key");
    const addModelBtn = document.getElementById("add-model-btn");
    const folderList = document.getElementById("folder-list"); // Folder list element

    // Chat State
    let conversations = {}; // Object to hold multiple conversations
    let currentConversationId = null;
    let chatTitleSet = false; // Flag to track if title has been set
    let folders = {}; // Object to hold folders
    let currentFolderId = null; // Currently selected folder

    // Settings State
    let models = [];
    let activeModel = null;
    let chatWidth = "800"; // px
    let chatHeight = "80"; // vh
    let chatFontSize = "16"; // px

    // Prevent multiple event listener attachments
    let isEventListenerAttached = false;

    // Initialize Conversations
    loadConversations();
    loadSettings();
    loadFolders();
    updateFolderListUI();
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

            const searchContent = searchInput.value.trim();

            if (!searchContent) {
                alert("Please enter your query.");
                return;
            }

            addMessageToHistory("user", searchContent);
            updateChatHistory();
            scrollToBottom();

            // Clear the input and disable input while waiting for reply
            searchInput.value = "";
            searchInput.style.height = "auto";
            searchInput.disabled = true;
            submitBtn.disabled = true;

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
                    // Queue title generation without blocking user input
                    promptForChatTitle();
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
            } finally {
                // Hide loading indicator and re-enable input
                hideLoading();
                searchInput.disabled = false;
                submitBtn.disabled = false;
                searchInput.focus();
            }
        });

        closeSidebarBtn.addEventListener("click", () => {
            toggleSidebarVisibility();
        });

        // Create folder button event listener
        document.getElementById("create-folder-btn")?.addEventListener("click", () => {
            createNewFolder();
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

        modelSelect.addEventListener("change", () => {
            const selectedName = modelSelect.value;
            activeModel = models.find(m => m.name === selectedName) || null;
            if (activeModel) {
                localStorage.setItem("activeModel", activeModel.name);
            }
        });

        addModelBtn.addEventListener("click", () => {
            addModel();
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

        // Keyboard Shortcuts: Ctrl+Enter to send
        searchInput.addEventListener("keydown", function(event) {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });

        // Auto-resize textarea to fit content
        searchInput.addEventListener("input", () => {
            searchInput.style.height = "auto";
            searchInput.style.height = searchInput.scrollHeight + "px";
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
     * Creates a new folder
     */
    function createNewFolder() {
        const folderName = prompt("Enter folder name:", "New Folder");
        if (folderName && folderName.trim()) {
            const folderId = 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            folders[folderId] = {
                id: folderId,
                name: folderName.trim(),
                conversations: []
            };
            currentFolderId = folderId;
            saveFolders();
            updateFolderListUI();
            updateConversationListUI();
        }
    }

    /**
     * Saves folders to localStorage
     */
    function saveFolders() {
        localStorage.setItem("folders", JSON.stringify(folders));
        localStorage.setItem("currentFolderId", currentFolderId);
    }

    /**
     * Loads folders from localStorage
     */
    function loadFolders() {
        const savedFolders = JSON.parse(localStorage.getItem("folders"));
        if (savedFolders && typeof savedFolders === "object") {
            folders = savedFolders;
        }
        
        currentFolderId = localStorage.getItem("currentFolderId");
        // If the stored folder doesn't exist, set to null
        if (currentFolderId && !folders[currentFolderId]) {
            currentFolderId = null;
        }
    }

    /**
     * Updates the UI list of folders in the sidebar
     */
    function updateFolderListUI() {
        const folderList = document.getElementById("folder-list");
        if (!folderList) return; // Guard clause in case element doesn't exist
        
        folderList.innerHTML = "";
        
        // Add "All Conversations" option
        const allConversationsLi = document.createElement("li");
        allConversationsLi.classList.add("folder-item");
        if (currentFolderId === null) {
            allConversationsLi.classList.add("active");
        }
        allConversationsLi.innerHTML = `<span>All Conversations</span>`;
        
        allConversationsLi.addEventListener("click", () => {
            currentFolderId = null;
            saveFolders();
            updateFolderListUI();
            updateConversationListUI();
        });
        
        folderList.appendChild(allConversationsLi);
        
        // Add all folders
        Object.keys(folders).forEach(folderId => {
            const folder = folders[folderId];
            const li = document.createElement("li");
            li.classList.add("folder-item");
            if (folderId === currentFolderId) {
                li.classList.add("active");
            }
            
            li.innerHTML = `
                <span>${sanitizeHTML(folder.name)}</span>
                <div class="folder-actions">
                    <button class="rename-folder-btn" title="Rename Folder">✏️</button>
                    <button class="delete-folder-btn" title="Delete Folder">🗑️</button>
                </div>
            `;
            
            // Event listener for selecting a folder
            li.querySelector("span").addEventListener("click", () => {
                currentFolderId = folderId;
                saveFolders();
                updateFolderListUI();
                updateConversationListUI();
            });
            
            // Event listener for renaming a folder
            li.querySelector(".rename-folder-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                const newName = prompt("Enter new folder name:", folder.name);
                if (newName && newName.trim()) {
                    folders[folderId].name = newName.trim();
                    saveFolders();
                    updateFolderListUI();
                }
            });
            
            // Event listener for deleting a folder
            li.querySelector(".delete-folder-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete the folder "${folder.name}"?`)) {
                    delete folders[folderId];
                    if (folderId === currentFolderId) {
                        currentFolderId = null;
                    }
                    saveFolders();
                    updateFolderListUI();
                    updateConversationListUI();
                }
            });
            
            folderList.appendChild(li);
        });
    }

    /**
     * Shows folder assignment menu for a conversation
     * @param {string} conversationId - The ID of the conversation to move
     * @param {HTMLElement} element - The element that triggered the menu
     */
    function showFolderAssignmentMenu(conversationId, element) {
        // Remove any existing menus
        const existingMenu = document.querySelector('.folder-menu');
        if (existingMenu) existingMenu.remove();
        
        // Create menu container
        const menu = document.createElement('div');
        menu.className = 'folder-menu';
        
        // Add "No Folder" option
        const noFolderOption = document.createElement('div');
        noFolderOption.className = 'folder-menu-item';
        noFolderOption.textContent = 'No Folder';
        noFolderOption.addEventListener('click', () => {
            // Remove from all folders
            Object.values(folders).forEach(folder => {
                const index = folder.conversations.indexOf(conversationId);
                if (index !== -1) {
                    folder.conversations.splice(index, 1);
                }
            });
            saveFolders();
            updateConversationListUI();
            menu.remove();
        });
        menu.appendChild(noFolderOption);
        
        // Add all folders as options
        Object.keys(folders).forEach(folderId => {
            const folder = folders[folderId];
            const option = document.createElement('div');
            option.className = 'folder-menu-item';
            option.textContent = folder.name;
            
            // Highlight if conversation is already in this folder
            if (folder.conversations.includes(conversationId)) {
                option.classList.add('selected');
            }
            
            option.addEventListener('click', () => {
                // First, remove from all folders
                Object.values(folders).forEach(f => {
                    const index = f.conversations.indexOf(conversationId);
                    if (index !== -1) {
                        f.conversations.splice(index, 1);
                    }
                });
                
                // Add to selected folder
                folders[folderId].conversations.push(conversationId);
                saveFolders();
                updateConversationListUI();
                menu.remove();
            });
            
            menu.appendChild(option);
        });
        
        // Position and show menu
        document.body.appendChild(menu);
        const rect = element.getBoundingClientRect();
        menu.style.top = `${rect.bottom}px`;
        menu.style.left = `${rect.left}px`;
        
        // Close menu when clicking outside
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== element) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
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
            const formattedContent = sanitizeHTML(msg.content)
                .replace(/```([\s\S]*?)```/g, (match, code) => `<pre><code>${code.replace(/\n/g, '\u0000')}</code></pre>`) 
                .replace(/\n/g, "<br>")
                .replace(/\u0000/g, '\n');
            messageContent.innerHTML = `
                <strong>${capitalizeFirstLetter(msg.role)}:</strong> ${formattedContent}
                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
            `;
            messageElement.appendChild(messageContent);
            addCopyButtonsToCodeBlocks(messageContent);

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
     * Adds copy buttons to code blocks within a message.
     * @param {HTMLElement} container - The message content container.
     */
    function addCopyButtonsToCodeBlocks(container) {
        const blocks = container.querySelectorAll('pre');
        blocks.forEach(block => {
            const button = document.createElement('button');
            button.classList.add('copy-code-btn');
            button.textContent = 'Copy';
            button.addEventListener('click', () => {
                navigator.clipboard.writeText(block.innerText);
                button.textContent = 'Copied!';
                setTimeout(() => (button.textContent = 'Copy'), 2000);
            });
            block.appendChild(button);
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
        if (!activeModel || !activeModel.apiUrl) {
            throw new Error("API URL is not set.");
        }

        // Debugging: Log the conversation roles
        console.log("Preparing to send conversation to API:");
        priorConversation.forEach((msg, idx) => {
            console.log(`${idx + 1}. Role: ${msg.role}, Content: ${msg.content}`);
        });

        const payload = {
            model: activeModel.name || "gpt-4",
            messages: [
                ...priorConversation.map(msg => ({ role: msg.role.toLowerCase(), content: msg.content })),
                { role: "user", content: userInput }
            ],
        };

        const response = await fetch(activeModel.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(activeModel.apiKey && { "Authorization": `Bearer ${activeModel.apiKey}` }),
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
        if (!activeModel) return;

        const titlePrompt = `Generate a single, specific title for this chat from the existing conversation context.

Rules:
- ≤8 words and ≤60 characters
- Title Case (capitalize principal words)
- No emojis, quotes, brackets, hashtags, markdown, or code fences
- No trailing punctuation
- Avoid generic titles like "Chat", "Conversation", "General", "Discussion"

Return ONLY the title text with nothing else.`;

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
        populateModelSelect();
        document.getElementById("chat-width").value = chatWidth;
        document.getElementById("chat-height").value = chatHeight;
        document.getElementById("chat-font-size").value = chatFontSize;
        modelSelect.focus();
    }

    /**
     * Closes the settings modal.
     */
    function closeSettingsModal() {
        settingsModal.classList.add("hidden");
    }

    /**
     * Adds a new model and updates the dropdown.
     */
    function addModel() {
        const name = newModelNameInput.value.trim();
        const apiUrl = newModelUrlInput.value.trim();
        const apiKey = newModelKeyInput.value.trim();

        if (!name || !apiUrl) {
            alert("Model name and API URL are required.");
            return;
        }

        if (models.some(m => m.name === name)) {
            alert("Model name already exists.");
            return;
        }

        const model = { name, apiUrl, apiKey };
        models.push(model);
        activeModel = model;
        localStorage.setItem("models", JSON.stringify(models));
        localStorage.setItem("activeModel", model.name);
        populateModelSelect();
        modelSelect.value = model.name;
        newModelNameInput.value = "";
        newModelUrlInput.value = "";
        newModelKeyInput.value = "";
    }

    /**
     * Populates the model dropdown from saved models.
     */
    function populateModelSelect() {
        modelSelect.innerHTML = "";
        models.forEach(model => {
            const option = document.createElement("option");
            option.value = model.name;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });
        if (activeModel) {
            modelSelect.value = activeModel.name;
        }
    }

    /**
     * Saves settings from the settings form to localStorage.
     */
    function saveSettings() {
        const chatWidthInput = document.getElementById("chat-width").value.trim();
        const chatHeightInput = document.getElementById("chat-height").value.trim();
        const chatFontSizeInput = document.getElementById("chat-font-size").value.trim();

        chatWidth = chatWidthInput || chatWidth;
        chatHeight = chatHeightInput || chatHeight;
        chatFontSize = chatFontSizeInput || chatFontSize;

        // Save settings to localStorage
        localStorage.setItem("chatWidth", chatWidth);
        localStorage.setItem("chatHeight", chatHeight);
        localStorage.setItem("chatFontSize", chatFontSize);

        applyChatSettings();

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
     * Applies chat appearance settings to the document.
     */
    function applyChatSettings() {
        document.documentElement.style.setProperty('--chat-max-width', `${chatWidth}px`);
        document.documentElement.style.setProperty('--chat-height', `${chatHeight}vh`);
        document.documentElement.style.setProperty('--chat-font-size', `${chatFontSize}px`);
    }

    /**
     * Loads settings from localStorage.
     */
    function loadSettings() {
        models = JSON.parse(localStorage.getItem("models")) || [];
        const activeName = localStorage.getItem("activeModel");
        activeModel = models.find(m => m.name === activeName) || models[0] || null;
        if (activeModel) {
            localStorage.setItem("activeModel", activeModel.name);
        }
        chatWidth = localStorage.getItem("chatWidth") || chatWidth;
        chatHeight = localStorage.getItem("chatHeight") || chatHeight;
        chatFontSize = localStorage.getItem("chatFontSize") || chatFontSize;
        applyChatSettings();
        const savedTitle = localStorage.getItem("chatTitle") || "";

        if (savedTitle && savedTitle !== "ChatGPT Assistant") {
            chatTitleElement.textContent = savedTitle;
            chatTitleSet = true; // Assume title is already set
        }

        if (!activeModel) {
            // If no model is configured, prompt the user to open the settings modal
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
		
        // Add the new conversation to the current folder if one is selected
        if (currentFolderId && folders[currentFolderId]) {
            folders[currentFolderId].conversations.push(newId);
            saveFolders();
        }
        
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
        
        // Get conversation IDs
        const conversationIds = Object.keys(conversations);
        
        // Filter conversations if a folder is selected
        const filteredIds = currentFolderId 
            ? folders[currentFolderId].conversations
            : conversationIds;
        
        // Sort by timestamp (newest first)
        filteredIds.sort((a, b) => {
            // Extract timestamp from conversation ID format 'conv_[timestamp]_[random]'
            const getTimestamp = id => {
                const match = id.match(/conv_(\d+)_/);
                return match ? parseInt(match[1]) : 0;
            };
            return getTimestamp(b) - getTimestamp(a); // Descending order
        });
        
        // Add conversations to the UI
        for (const id of filteredIds) {
            if (!conversations[id]) continue; // Skip if conversation doesn't exist
            
            const convo = conversations[id];
            const li = document.createElement("li");
            li.classList.add("conversation-item");
            if (id === currentConversationId) {
                li.classList.add("active");
            }

            li.innerHTML = `
                <span>${sanitizeHTML(convo.title)}</span>
                <div class="conversation-actions">
                    <button class="folder-assign-btn" title="Move to Folder">📂</button>
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
            
            // Event listener for assigning to folder
            li.querySelector(".folder-assign-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                showFolderAssignmentMenu(id, e.target);
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
                    // Remove conversation from any folder
                    Object.values(folders).forEach(folder => {
                        const index = folder.conversations.indexOf(id);
                        if (index !== -1) {
                            folder.conversations.splice(index, 1);
                        }
                    });
                    
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
                    saveFolders();
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

        const titlePrompt = `Generate a single, specific title for this chat from the existing conversation context.

Rules:
- ≤8 words and ≤60 characters
- Title Case (capitalize principal words)
- No emojis, quotes, brackets, hashtags, markdown, or code fences
- No trailing punctuation
- Avoid generic titles like "Chat", "Conversation", "General", "Discussion"

Return ONLY the title text with nothing else.`;

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
