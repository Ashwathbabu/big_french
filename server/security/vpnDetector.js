module.exports=(req,res,next)=>{

const ip =
 req.headers['x-forwarded-for']
 || req.socket.remoteAddress;

if(ip.includes("proxy")){
   return res.send("VPN not allowed");
}

next();
};