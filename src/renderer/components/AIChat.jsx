import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Bot, User, Trash2, Zap } from 'lucide-react';
import { toast } from 'react-toastify';

export default function AIChat({ theme, accentColor, user }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Привет! Я твой персональный AI-тренер. Я вижу твои заезды, FTP и форму. Спрашивай о чем угодно!' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const loadSettings = async () => {
            if (window.electronAPI.getSettings) {
                const settings = await window.electronAPI.getSettings();
                if (settings.lmStudioUrl) setLmStudioUrl(settings.lmStudioUrl);
            }
        };
        loadSettings();
    }, []);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            // Собираем контекст данных
            const rides = await window.electronAPI.getRides();
            const fitness = await window.electronAPI.getFitnessForm();
            
            const lastRidesSummary = rides.slice(0, 5).map(r => 
                `- ${r.date}: ${r.title}, ${r.distance}км, TSS: ${r.tss}, Сред. пульс: ${r.avg_hr}`
            ).join('\n');

            const contextPrompt = `
Контекст атлета:
- Имя: ${user?.name || 'Атлет'}
- FTP: ${user?.ftp} Вт
- Вес: ${user?.weight} кг
- Текущая форма (CTL): ${fitness.ctl}
- Усталость (ATL): ${fitness.atl}
- Баланс (TSB): ${fitness.tsb}

Последние 5 активностей:
${lastRidesSummary}

Запрос пользователя: ${input}
Отвечай кратко, профессионально, как спортивный эксперт.
`;

            const response = await fetch(`${lmStudioUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "local-model",
                    messages: [
                        { role: 'system', content: 'Ты - эксперт-тренер по велоспорту и триатлону. Твоя задача - анализировать данные атлета и давать советы. Отвечай на языке пользователя.' },
                        { role: 'user', content: contextPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 800
                })
            });

            if (!response.ok) throw new Error('LM Studio не отвечает');

            const data = await response.json();
            const aiResponse = { role: 'assistant', content: data.choices[0].message.content };
            setMessages(prev => [...prev, aiResponse]);

        } catch (err) {
            console.error(err);
            toast.error('AI сервер не в сети. Проверь LM Studio.');
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: 'Извини, я сейчас не могу подключиться к своему "мозгу" (LM Studio). Убедись, что сервер запущен на ' + lmStudioUrl 
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4 animate-fade-in p-2">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                        <MessageSquare className="text-indigo-400" size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-white">AI Тренер-Консультант</h2>
                </div>
                <button 
                    onClick={() => setMessages([messages[0]])}
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                    title="Очистить чат"
                >
                    <Trash2 size={20} />
                </button>
            </div>

            {/* Chat Window */}
            <div className={`flex-1 overflow-y-auto rounded-3xl border border-white/10 p-6 space-y-4 transition-all ${theme === 'dark' ? 'bg-black/20' : 'bg-white shadow-inner'}`}>
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-orange-500' : 'bg-indigo-600'}`}>
                                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>
                            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                m.role === 'user' 
                                ? 'bg-orange-500 text-white rounded-tr-none' 
                                : 'bg-white/10 text-gray-200 border border-white/5 rounded-tl-none'
                            }`}>
                                {m.content}
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/5 p-4 rounded-2xl flex items-center gap-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="relative group">
                <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Спроси совета по тренировкам или проанализируй заезд..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 pr-16 text-white placeholder-gray-500 focus:border-indigo-500 outline-none transition-all focus:bg-white/10"
                />
                <button 
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:grayscale"
                >
                    <Send size={20} />
                </button>
            </div>
            
            <p className="text-[10px] text-gray-600 text-center flex items-center justify-center gap-1">
                <Zap size={10} /> Работает на базе вашего локального LM Studio сервера
            </p>
        </div>
    );
}