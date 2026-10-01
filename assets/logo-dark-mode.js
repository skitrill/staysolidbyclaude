document.addEventListener("DOMContentLoaded", function () {
    function updateLogoForDarkMode() {
        const logo = document.querySelector(".header__heading-logo");
        if (!logo) return;
        
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            logo.style.filter = "brightness(0) invert(1)";
        } else {
            logo.style.filter = "none";
        }
    }

    // Run on load
    updateLogoForDarkMode();
    
    // Detect changes in system color scheme
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateLogoForDarkMode);
});
