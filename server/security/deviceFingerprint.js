module.exports = (req,res,next)=>{

   const device =
      req.headers["x-device-id"];

   if(device){
      req.deviceId = device;
   }

   next();
};