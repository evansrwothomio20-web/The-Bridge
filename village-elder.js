/**
 * Village Elder AI - Multilingual Agricultural Advisor
 * Integrates Sunbird AI for Ugandan Dialects and Google Gemini for Wisdom.
 */

const CONFIG = {
    SUNBIRD_API_KEY: 'YOUR_SUNBIRD_API_KEY', // User should replace this
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',   // User should replace this
    SUNBIRD_BASE_URL: 'https://api.sunbird.ai',
    GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    LANGUAGES: {
        'Luganda': { sunbird: 'lug', speaker_id: 248 },
        'Acholi': { sunbird: 'ach', speaker_id: null }, 
        'Lusoga': { sunbird: 'teo', speaker_id: null }, 
        'Runyankole': { sunbird: 'nyn', speaker_id: null },
        'Swahili': { sunbird: 'swh', speaker_id: null }
    }
};

class VillageElder {
    constructor() {
        this.selectedLanguage = 'Luganda';
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        this.initElements();
        this.initEvents();
    }

    initElements() {
        this.trigger = document.getElementById('elderTrigger');
        this.panel = document.getElementById('elderPanel');
        this.closeBtn = document.getElementById('elderClose');
        this.chat = document.getElementById('elderChat');
        this.input = document.getElementById('elderInput');
        this.sendBtn = document.getElementById('btnSend');
        this.voiceBtn = document.getElementById('btnVoice');
        this.dialectSelect = document.getElementById('dialectSelect');
        this.audioPlayer = document.getElementById('elderAudio');
    }

    initEvents() {
        this.trigger.addEventListener('click', () => this.panel.classList.toggle('active'));
        this.closeBtn.addEventListener('click', () => this.panel.classList.remove('active'));
        
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
        
        this.dialectSelect.addEventListener('change', (e) => {
            this.selectedLanguage = e.target.value;
            this.addMessage('elder', `I will now speak in ${this.selectedLanguage}. How can I help your farm today?`);
        });

        this.voiceBtn.addEventListener('click', () => this.toggleRecording());
    }

    async handleSend() {
        const text = this.input.value.trim();
        if (!text) return;

        this.input.value = '';
        this.addMessage('user', text);
        
        await this.processQuery(text);
    }

    async processQuery(userInput) {
        this.showLoading();

        try {
            // 1. Translate local dialect to English for reasoning
            let englishQuery = userInput;
            if (this.selectedLanguage !== 'English' && this.selectedLanguage !== 'Swahili') {
                englishQuery = await this.translateWithSunbird(userInput, CONFIG.LANGUAGES[this.selectedLanguage].sunbird, 'eng');
            }

            // 2. Get Agricultural Wisdom from Gemini
            const wisdom = await this.getGeminiWisdom(englishQuery);

            // 3. Translate Wisdom back to Local Dialect
            const localAdvice = await this.translateWithSunbird(wisdom.voice_script, 'eng', CONFIG.LANGUAGES[this.selectedLanguage].sunbird);

            // 4. Update UI
            this.removeLoading();
            this.addMessage('elder', localAdvice);

            // 5. Generate and Play Spoken Audio
            await this.playSpokenResponse(localAdvice);

        } catch (error) {
            console.error('Village Elder Error:', error);
            this.removeLoading();
            this.addMessage('elder', "Forgive me, friend. The spirits of the wires are tangled. Please try again.");
        }
    }

    async translateWithSunbird(text, source, target) {
        try {
            const response = await fetch(`${CONFIG.SUNBIRD_BASE_URL}/tasks/nllb_translate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.SUNBIRD_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    source_language: source,
                    target_language: target,
                    text: text
                })
            });
            const data = await response.json();
            return data.output || text;
        } catch (e) {
            console.warn('Sunbird Translation failed.');
            return text;
        }
    }

    async getGeminiWisdom(query) {
        const prompt = `
            Master Prompt: The "Multilingual Village Elder" Alignment Layer
            You are the Village Elder, an expert Agronomist. 
            Input: "${query}"
            Environment: Local Ugandan climate.
            Requirement: Return ONLY a JSON object with:
            {
                "emotional_tone": "detected mood",
                "visual_status": "Green/Yellow/Red",
                "voice_script": "under 50 words of agricultural advice in English",
                "action_icon": "emoji"
            }
        `;

        const response = await fetch(`${CONFIG.GEMINI_BASE_URL}?key=${CONFIG.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        const data = await response.json();
        const textResponse = data.candidates[0].content.parts[0].text;
        return JSON.parse(textResponse.replace(/```json|```/g, ''));
    }

    async playSpokenResponse(text) {
        const langInfo = CONFIG.LANGUAGES[this.selectedLanguage];
        if (!langInfo || !langInfo.speaker_id) return;

        try {
            const response = await fetch(`${CONFIG.SUNBIRD_BASE_URL}/tasks/tts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.SUNBIRD_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    speaker_id: langInfo.speaker_id
                })
            });
            
            const data = await response.json();
            if (data.output_file_url) {
                this.audioPlayer.src = data.output_file_url;
                this.audioPlayer.play();
            }
        } catch (e) {
            console.warn('TTS playback failed.');
        }
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                await this.handleAudioInput(audioBlob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.voiceBtn.classList.add('recording');
        } catch (err) {
            console.error('Audio recording failed:', err);
        }
    }

    stopRecording() {
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.voiceBtn.classList.remove('recording');
        }
    }

    async handleAudioInput(blob) {
        this.showLoading();
        this.addMessage('user', '<i>(Voice message recorded)</i>');
        this.removeLoading();
        this.addMessage('elder', "I have heard your voice, friend. To get agricultural advice in your dialect, please type your question for now as I connect the speech spirits.");
    }

    addMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender}`;
        msgDiv.innerHTML = text;
        this.chat.appendChild(msgDiv);
        this.chat.scrollTop = this.chat.scrollHeight;
    }

    showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chat-msg elder loading';
        loadingDiv.id = 'elderLoading';
        loadingDiv.innerHTML = `
            <div class="loading-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
        this.chat.appendChild(loadingDiv);
        this.chat.scrollTop = this.chat.scrollHeight;
    }

    removeLoading() {
        const loading = document.getElementById('elderLoading');
        if (loading) loading.remove();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.villageElder = new VillageElder();
});
