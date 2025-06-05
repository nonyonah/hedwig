import React, { useState } from 'react';

interface Message {
  type: 'user' | 'ai';
  content: string;
}

interface AIResponseProps {
  messages: Message[];
  isSubmitting: boolean;
  onSend: (msg: string) => void;
  onStop: () => void;
  inputValue: string;
  setInputValue: (val: string) => void;
  appPrimaryColor: string;
}

export default function AIResponse({
  messages,
  isSubmitting,
  onSend,
  onStop,
  inputValue,
  setInputValue,
  appPrimaryColor,
}: AIResponseProps) {
  const [focused, setFocused] = useState(false);

  // SVGs
  const sendIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 33 32" fill="none">
      <path d="M16.5 3C13.9288 3 11.4154 3.76244 9.27759 5.1909C7.13975 6.61935 5.47351 8.64968 4.48957 11.0251C3.50563 13.4006 3.24819 16.0144 3.7498 18.5362C4.25141 21.0579 5.48953 23.3743 7.30762 25.1924C9.1257 27.0105 11.4421 28.2486 13.9638 28.7502C16.4856 29.2518 19.0995 28.9944 21.4749 28.0104C23.8503 27.0265 25.8807 25.3603 27.3091 23.2224C28.7376 21.0846 29.5 18.5712 29.5 16C29.4964 12.5533 28.1256 9.24882 25.6884 6.81163C23.2512 4.37445 19.9467 3.00364 16.5 3ZM21.2075 15.7075C21.1146 15.8005 21.0043 15.8742 20.8829 15.9246C20.7615 15.9749 20.6314 16.0008 20.5 16.0008C20.3686 16.0008 20.2385 15.9749 20.1171 15.9246C19.9957 15.8742 19.8854 15.8005 19.7925 15.7075L17.5 13.4137V21C17.5 21.2652 17.3946 21.5196 17.2071 21.7071C17.0196 21.8946 16.7652 22 16.5 22C16.2348 22 15.9804 21.8946 15.7929 21.7071C15.6054 21.5196 15.5 21.2652 15.5 21V13.4137L13.2075 15.7075C13.0199 15.8951 12.7654 16.0006 12.5 16.0006C12.2346 16.0006 11.9801 15.8951 11.7925 15.7075C11.6049 15.5199 11.4994 15.2654 11.4994 15C11.4994 14.7346 11.6049 14.4801 11.7925 14.2925L15.7925 10.2925C15.8854 10.1995 15.9957 10.1258 16.1171 10.0754C16.2385 10.0251 16.3686 9.99921 16.5 9.99921C16.6314 9.99921 16.7615 10.0251 16.8829 10.0754C17.0043 10.1258 17.1146 10.1995 17.2075 10.2925L21.2075 14.2925C21.3005 14.3854 21.3742 14.4957 21.4246 14.6171C21.4749 14.7385 21.5008 14.8686 21.5008 15C21.5008 15.1314 21.4749 15.2615 21.4246 15.3829C21.3742 15.5043 21.3005 15.6146 21.2075 15.7075Z" fill={inputValue.trim() ? appPrimaryColor : 'gray'} fillOpacity="0.5"/>
    </svg>
  );

  const stopIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 3C13.4288 3 10.9154 3.76244 8.77759 5.1909C6.63975 6.61935 4.97351 8.64968 3.98957 11.0251C3.00563 13.4006 2.74819 16.0144 3.2498 18.5362C3.75141 21.0579 4.98953 23.3743 6.80762 25.1924C8.6257 27.0105 10.9421 28.2486 13.4638 28.7502C15.9856 29.2518 18.5995 28.9944 20.9749 28.0104C23.3503 27.0265 25.3807 25.3603 26.8091 23.2224C28.2376 21.0846 29 18.5712 29 16C28.9964 12.5533 27.6256 9.24882 25.1884 6.81163C22.7512 4.37445 19.4467 3.00364 16 3ZM20 19.5C20 19.6326 19.9473 19.7598 19.8536 19.8536C19.7598 19.9473 19.6326 20 19.5 20H12.5C12.3674 20 12.2402 19.9473 12.1465 19.8536C12.0527 19.7598 12 19.6326 12 19.5V12.5C12 12.3674 12.0527 12.2402 12.1465 12.1464C12.2402 12.0527 12.3674 12 12.5 12H19.5C19.6326 12 19.7598 12.0527 19.8536 12.1464C19.9473 12.2402 20 12.3674 20 12.5V19.5Z" fill={appPrimaryColor}/>
    </svg>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Chat bubbles */}
      <div className="flex flex-col flex-grow space-y-4 p-4 overflow-y-auto">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-[70%] px-4 py-2 rounded-xl text-base ${
              msg.type === 'user'
                ? 'bg-primary text-white self-end ml-auto' // User bubble
                : 'bg-gray-100 text-gray-900 self-start mr-auto' // AI bubble
            }`}
            style={msg.type === 'user' ? { background: appPrimaryColor, color: 'white' } : {}}
          >
            {msg.content}
          </div>
        ))}
      </div>
      {/* Chatbox */}
      <form
        className="flex items-center w-full border-t border-gray-200 px-4 py-2 bg-white"
        style={{ minHeight: 64 }}
        onSubmit={e => {
          e.preventDefault();
          if (inputValue.trim()) onSend(inputValue);
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-grow px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent bg-white outline-none"
          placeholder="Ask anything..."
          disabled={isSubmitting}
          style={{ fontSize: 16 }}
        />
        <button
          type="button"
          onClick={isSubmitting ? onStop : () => inputValue.trim() && onSend(inputValue)}
          disabled={!inputValue.trim() && !isSubmitting}
          className="ml-2 flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, background: 'transparent', border: 'none', padding: 0 }}
        >
          {isSubmitting ? stopIcon : sendIcon}
        </button>
      </form>
    </div>
  );
}
