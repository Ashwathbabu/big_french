(function() {
    let isRedirecting = false; // Multiple alerts ko rokne ke liye

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        
        if (response.status === 401 && !isRedirecting) {
            // Response body ko safely check karo
            const clone = response.clone();
            try {
                const data = await clone.json();
                
                if (data.forceLogout || (data.message && data.message.includes('Session expired'))) {
                    isRedirecting = true;
                    alert("Security Alert: This account was just used to login on another browser or device. Your current session has ended.");
                    
                    // Sab kuch saaf karo aur login page pe bhejo
                    localStorage.clear();
                    window.location.replace('login.html'); 
                }
            } catch (e) {
                // Agar response JSON nahi hai toh ignore karein
            }
        }
        return response;
    };

    console.log("✅ Netflix-Style Security Active (authGuard)");
})();