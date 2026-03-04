const session = require("express-session");

module.exports = session({
    secret: process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    cookie:{
        secure:true,
        httpOnly:true,
        maxAge:30*60*1000
    }
});