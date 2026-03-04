const crypto = require("crypto");

const otpStore = new Map();

exports.generateOTP = (email)=>{

    const otp =
      crypto.randomInt(100000,999999);

    otpStore.set(email,{
        otp,
        expires:Date.now()+5*60*1000
    });

    return otp;
};

exports.verifyOTP=(email,code)=>{

    const data = otpStore.get(email);

    if(!data) return false;

    if(
       data.otp == code &&
       Date.now() < data.expires
    ){
        otpStore.delete(email);
        return true;
    }

    return false;
};