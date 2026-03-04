/* ===============================
   BIGFRENCH VIDEO DRM
   =============================== */

(function () {

// Disable right click on videos
document.addEventListener("contextmenu", function(e){
    if(e.target.tagName === "VIDEO"){
        e.preventDefault();
    }
});

// Remove download option
document.querySelectorAll("video")
.forEach(video=>{

    video.setAttribute(
        "controlsList",
        "nodownload noremoteplayback"
    );

    video.disablePictureInPicture = true;
});

// Screenshot blur trick
document.addEventListener("keyup",function(e){

    if(e.key === "PrintScreen"){
        document.body.style.filter="blur(20px)";

        setTimeout(()=>{
            document.body.style.filter="none";
        },1000);
    }

});

})();