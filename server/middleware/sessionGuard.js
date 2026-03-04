/* =====================================
   SESSION DEVICE GUARD
===================================== */

const activeUsers = require("../activeUsers");

module.exports = (req,res,next)=>{

    if(!req.session.userId)
        return next();

    const userId =
        req.session.userId.toString();

    const device =
        req.headers["x-device-id"];

    if(
        activeUsers.has(userId) &&
        activeUsers.get(userId) !== device
    ){
        req.session.destroy(()=>{
            return res.status(401)
            .send("Account already active on another device");
        });
    }

    next();
};