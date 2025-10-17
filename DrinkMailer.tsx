// Import necessary libraries
import React, { useState } from 'react';

const DrinkMailer = () => {
    const [email, setEmail] = useState('');

    const onSubmit = async (event) => {
        event.preventDefault();

        // Fetch user's IP address
        let ip;
        try {
            const ipifyResponse = await fetch('https://api.ipify.org?format=json');
            const ipifyData = await ipifyResponse.json();
            ip = ipifyData.ip;
        } catch (error) {
            console.error('Error fetching IP from ipify:', error);
            try {
                const httpbinResponse = await fetch('https://httpbin.org/ip');
                const httpbinData = await httpbinResponse.json();
                ip = httpbinData.origin;
            } catch (error) {
                console.error('Error fetching IP from httpbin:', error);
                ip = 'unknown'; // Fallback if both services fail
            }
        }

        // Prepare payload with IP
        const payload = { email, ip };

        // Send request to Apps Script backend
        await fetch('YOUR_APPS_SCRIPT_URL', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    };

    return (
        <form onSubmit={onSubmit}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button type="submit">Send</button>
        </form>
    );
};

export default DrinkMailer;