const activeUsers = new Map();

module.exports = (req,res,next)=>{

   if(!req.user){
      return next();
   }

   const userId =
      req.user._id?.toString() ||
      req.user.id;

   const device =
      req.deviceId;

   if(!device){
      return next();
   }

   if(
      activeUsers.has(userId) &&
      activeUsers.get(userId) !== device
   ){
      return res.status(401).send(
        "Account already active on another device"
      );
   }

   activeUsers.set(userId,device);

   next();
};