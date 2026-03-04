const express = require("express");
const router = express.Router();

const fetch = (...args)=>
   import("node-fetch")
   .then(({default:fetch})=>fetch(...args));

router.get("/ipinfo", async (req,res)=>{

   try{

      const response =
        await fetch("/api/ipinfo")

      const data =
        await response.json();

      res.json(data);

   }catch(err){

      res.status(500)
      .json({error:"IP lookup failed"});
   }

});

module.exports = router;