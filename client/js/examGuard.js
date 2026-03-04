/* ===============================
   EXAM GUARD FINAL VERSION
================================ */

let warning = 0;
let examTerminated = false;


/* ===============================
   TAB SWITCH DETECT
================================ */

document.addEventListener("visibilitychange", () => {

    if (examTerminated) return;

    if (document.hidden) {

        warning++;

        alert(`Warning ${warning}/3
Tab switching is not allowed during exam`);

        if (warning >= 3) {

            terminateExam();
        }
    }
});


/* ===============================
   TERMINATE EXAM
================================ */

function terminateExam() {

    examTerminated = true;

    alert("Exam terminated due to cheating attempt.");

    // ✅ REMOVE leave protection
    window.onbeforeunload = null;

    // ✅ HARD REDIRECT
    window.location.replace("/dashboard.html");
}


/* ===============================
   BLOCK PAGE EXIT DURING EXAM
================================ */

window.onbeforeunload = function () {

    if (!examTerminated) {
        return "Exam in progress";
    }
};