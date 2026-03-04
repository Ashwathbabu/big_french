const crypto = require("crypto");

exports.verifyPayment = (
 order_id,
 payment_id,
 signature
)=>{

const body =
order_id + "|" + payment_id;

const expected =
crypto.createHmac(
 "sha256",
 process.env.RAZORPAY_SECRET
)
.update(body)
.digest("hex");

return expected === signature;
};