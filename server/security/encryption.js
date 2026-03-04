const crypto = require("crypto");

exports.encrypt = (text)=>{
 const cipher =
 crypto.createCipheriv(
   "aes-256-cbc",
   Buffer.from(process.env.KEY),
   Buffer.alloc(16,0)
 );

 return cipher.update(text,"utf8","hex")
        + cipher.final("hex");
};