/* =========================================
   FETCH SECURITY MASTER
   ✅ Device ID
   ✅ Session
   ✅ Single Device Detection
=========================================*/

(function () {

    console.log("✅ Fetch Security Active");

    /* ===============================
       DEVICE CREATE
    =============================== */

    if (!localStorage.getItem("deviceId")) {

        localStorage.setItem(
            "deviceId",
            crypto.randomUUID()
        );

        console.log("✅ Device ID Created");
    }


    /* ===============================
       SINGLE FETCH INTERCEPTOR
    =============================== */

    const originalFetch = window.fetch;

    window.fetch = async function (url, options = {}) {

        options.credentials = "include";

        options.headers = {
            ...(options.headers || {}),
            "x-device-id":
                localStorage.getItem("deviceId")
        };

        const response =
            await originalFetch(url, options);


        /* ===============================
           DEVICE BLOCK DETECT
        =============================== */

        if (response.status === 401) {

            const text =
                await response.clone().text();

            if (
                text.includes(
                    "Account already active"
                )
            ) {
                alert(
                  "Account already active on another device"
                );

                window.location =
                    "/login.html";
            }
        }

        return response;
    };


    /* ===============================
       GLOBAL LOGOUT
    =============================== */

    window.secureLogout = function () {

        fetch("/logout", {
            method: "POST"
        })
        .then(() => {

            console.log("✅ Device Released");

            window.location =
                "/login.html";

        });

    };

})();