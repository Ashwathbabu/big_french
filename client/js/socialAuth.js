document.addEventListener("DOMContentLoaded", () => {
    // Buttons ko ID se get kar rahe hain
    const googleBtn = document.getElementById("btn-google");
    const appleBtn = document.getElementById("btn-apple");

    if (googleBtn) {
        googleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            // Google auth route par redirect karega
            window.location.href = "/api/auth/google";
        });
    }

    if (appleBtn) {
        appleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            // Apple auth route par redirect karega
            window.location.href = "/api/auth/apple";
        });
    }
});