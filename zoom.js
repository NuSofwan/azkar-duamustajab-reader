const canvas = document.getElementById("pdf-canvas");

let scale = 1;
let startDistance = 0;
let startScale = 1;

function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function applyZoom() {
    canvas.style.transform = `scale(${scale})`;
}

/* Pinch Start */

canvas.addEventListener("touchstart", (e) => {

    if (e.touches.length === 2) {
        startDistance = getDistance(e.touches);
        startScale = scale;
    }

});

/* Pinch Move */

canvas.addEventListener("touchmove", (e) => {

    if (e.touches.length === 2) {

        e.preventDefault();

        const distance = getDistance(e.touches);

        scale = startScale * (distance / startDistance);

        if (scale < 1) scale = 1;
        if (scale > 4) scale = 4;

        applyZoom();
    }

}, { passive: false });

/* Double Tap Zoom */

let lastTap = 0;

canvas.addEventListener("touchend", (e) => {

    const now = new Date().getTime();
    const tapLength = now - lastTap;

    if (tapLength < 300 && tapLength > 0) {

        if (scale === 1) {
            scale = 2;
        } else {
            scale = 1;
        }

        applyZoom();
    }

    lastTap = now;

});

/* Mouse Wheel Zoom */

window.addEventListener("wheel", (e) => {

    if (e.ctrlKey) {

        e.preventDefault();

        if (e.deltaY < 0) {
            scale += 0.1;
        } else {
            scale -= 0.1;
        }

        if (scale < 1) scale = 1;
        if (scale > 4) scale = 4;

        applyZoom();
    }

}, { passive: false });