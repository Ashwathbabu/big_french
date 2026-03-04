const allowed = ["IN","CA","US"];

module.exports=(req,res,next)=>{

   const country=req.headers["cf-ipcountry"];

   if(country && !allowed.includes(country))
        return res.send("Region blocked");

   next();
};