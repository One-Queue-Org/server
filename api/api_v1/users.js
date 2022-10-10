const express = require('express');
const router = express.Router();
const UserSchema = require('../../model/users');
const OrganizationSchema = require('../../model/organizationDB');
const qrcode = require('qrcode');
const INITIAL_URL = '/api/_v1/';
const sendEmail = require('../../utils/mail');
const userMail = require('../../utils/users/userMail');
const userMailRegistered = require('../../utils/users/userRegistered');
/**
 *             User Api
 * 
 */
 
// User Registration
router.post(INITIAL_URL + 'register/user', async (req, res) => {
    const userContact = req.body.contact;
    let checkEmail = false;
    // check that userContact is Email or Phone
    if(userContact.includes('@')){
        checkEmail = true;
    }
    const userName = req.body.userName;
    const userGender = req.body.userGender;
    const userAge = req.body.userAge;
    const othersData = req.body.formValues;
    

    const orgId = req.body.orgId;
    const serviceCode = parseInt(req.body.serviceCode, 10);
    const organization = await OrganizationSchema.findById(orgId);
    const service = organization.services.find(service => service.serviceCode === parseInt(serviceCode, 10));
    // Generate 6 digits OTP
    const otp = Math.floor(Math.random() * 1000000);
    const saveUser = new UserSchema({
        userId : "Not Generated",
        name : userName,
        gender: userGender,
        age: userAge,
        email: checkEmail ? userContact : 'Unknown',
        phone: checkEmail ? 'Unknown' : userContact,
        otherMembers: [],
        otherMembersAge: [],
        otherMembersGender: [],
        organizationId: orgId,
        organization: organization.name,
        services: service.serviceName,
        serviceCode: serviceCode,
        emergency: req.body.emergency ? true : false,
        otp: otp,
        // verified == false
        authorized: false,
        emergency: false,
    });
    const saveStatus = await saveUser.save();
    if(saveStatus){
        if(sendEmail(userContact, "User Verification | One -Queue",userMailRegistered(organization.name, service.serviceName, Date.now(), otp))){
            res.status(200).send({
                message: 'User Registered Successfully, but not verified, please verify your account',
                _id : saveUser._id
            });
        }else{
            res.status(500).send({
                message: 'User Registered Successfully, but not verified, please verify your account',
                error: "Mail not sent",
                _id : saveUser._id
            });
        }
    }
});

const queue = [];

// Post verify user
router.post(INITIAL_URL + 'verify/user/', async (req, res)=>{
    const userId = req.body.id;
    const otp  = req.body.otp;
    const userData = await UserSchema.findById(userId);
    console.log(userData.otp);
    console.log(otp);
    if(userData){
        if(userData.otp == otp){
            // console.log("found!");
            const orgId = userData.organizationId;
            const serviceCode = userData.serviceCode;
            const organization = await OrganizationSchema.findById(orgId);
            const service = organization.services.find(service => service.serviceCode === parseInt(serviceCode, 10));
            console.log(service);
            userData.authorized = true;
            
            /**
             * Find the counter with minimum length of queue
             */
            const minCounterIdx = 0;
            for(let i = 0; i < service.counter.length; i++){
                if(service.counter[i].queue.length < service.counter[minCounterIdx].queue.length){
                    minCounterIdx = i;
                }
            }
            // console.log(minCounterIdx);
            // console.log(service.counter[minCounterIdx]);
            // Generating Unique user id --> organizationCode + # + totalTokens
            let tokenNumber = service.counter[minCounterIdx].currentTokens + 1;
            const userId = organization.code + '#' + (service.counter[minCounterIdx].totalTokens + 1);
            organization.services.counter[minCounterIdx].totalTokens = service.counter[minCounterIdx].totalTokens + 1;
            // console.log(service.counter[minCounterIdx]);
            organization.find(service => service.serviceCode === parseInt(serviceCode, 10)).services.counter[minCounterIdx].queue.push({
                tokenNumber: tokenNumber,
                userId: userId,
                userName: userData.name,
                userAge: userData.age,
                userEmail: userData.email
            });
            const updateOrg = await OrganizationSchema.findByIdAndUpdate(orgId, organization);
            userData.userTokenCode = userId;
            userData.tokenNumber = tokenNumber;
            userData.counterNumber = service.counter[minCounterIdx].counterNumber;
            userData.counterName = service.counter[minCounterIdx].counterName;
            userData.save();
            qrcode.toDataURL(userId, async function (err, url) {
                if(err){
                    res.status(500).send({
                        message: "Error generating QR code"
                    });
                }else{
                    // Save User Token data
                    const saveUserQrCode = await userData.updateOne({_id: userId, qrcode: userId});
                    if(saveUserQrCode){
                        sendEmail(userData.email, 'Token Number', 'Your Token Number is ' + tokenNumber + '<img src=' + url + '>');
                        // Send
                        res.status(200).send({
                            message: "User registered in the token",
                            token: userId,
                            qrCode: url,
                            data: userData
                        });
                    }else{
                        res.status(500).send({
                            message: "Error Verifying User"
                        });
                    }
                }
            });

        }else{
            res.status(500).send({
                message: "Invalid OTP"
            });
        }
    }else{
        res.status(500).send({
            message: "Invalid User Id"
        });
    }

});



module.exports = router;