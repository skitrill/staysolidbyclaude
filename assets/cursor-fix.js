document.addEventListener("DOMContentLoaded", function() {
    document.body.style.cursor = "default";
    
    document.querySelectorAll("a, button, input, select, textarea").forEach(el => {
        el.style.cursor = "pointer";
    });

    document.querySelectorAll("input[type='text'], textarea").forEach(el => {
        el.style.cursor = "text";
    });
});
