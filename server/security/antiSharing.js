const activeSessions = {};

module.exports=(req,res,next)=>{

 const user=req.user.id;

 if(activeSessions[user]
     && activeSessions[user]!==req.deviceId)
        return res.send("Another device logged in");

 activeSessions[user]=req.deviceId;

 next();
};