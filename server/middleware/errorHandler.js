module.exports = (err, req, res, next) => {

    console.error("🔥 SERVER ERROR:");
    console.error(err.stack);

    res.status(err.status || 500).json({
        success:false,
        message:"Internal Server Error"
    });
};