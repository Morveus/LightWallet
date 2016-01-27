

// TODO : Commentaires & Documentation
// TODO : Processus de mise à jour du firmware des cartes
// TODO : Revoir les lib JS qui sont réellement utiles
// TODO : Dérivation des addresses en JS


var LWList = {
    cards : new Array(),    /* Contains the list of LedgerWallet cards */
    cardFactoryWinUSB : null, 
    cardFactoryHID : null,
    lastState: null,

    init : function ()  {
        LWTools.console("LWList.init", 3);
        var lWList = this;

        lWList.cardFactoryWinUSB = new ChromeapiPlugupCardTerminalFactory(0x1b7c);
        lWList.cardFactoryHID = new ChromeapiPlugupCardTerminalFactory(0x3b7c, undefined, true);
        
        setTimeout(function(){
            lWList.checkCard();
        }, 1000);
    },

    checkCard : function ()  {
        LWTools.console("LWList.checkCard", 3);
        var lWList = this;

        lWList.getCard().then(function(result){
            if (typeof result != "undefined") {
                lWList.cards[0] = new LW(0, result);    // TODO : A modifier pour gérer X cartes
            }else{
                setTimeout(function(){
                    lWList.checkCard();
                }, 1000);
            }       
        }, function(error) {
           LWTools.console(error, 1);
        });

    },

    getCard : function ()  {
        LWTools.console("LWList.getCard", 3);
        var lWList = this;

        try {
            return lWList.cardFactoryHID.list_async().then(function(result) {
                LWTools.console("result getCard HID :", 3);
                LWTools.console(result);
                if (result.length == 0) {
                    return lWList.cardFactoryWinUSB.list_async().then(function(result) {
                        LWTools.console("result getCard WinUSB :", 3);
                        LWTools.console(result);
                        if (result.length == 0) {
                            return;
                        } else {
                            return lWList.cardFactoryWinUSB.getCardTerminal(result[0]).getCard_async();    // TODO : A modifier pour gérer X cartes
                        }
                    });
                } else {
                    return lWList.cardFactoryHID.getCardTerminal(result[0]).getCard_async();    // TODO : A modifier pour gérer X cartes
                }
            });
        } catch(e) {
            LWTools.console("getCard fail", 1);
            LWTools.console(e, 1);
            return;
        }
    },
}

function LW (id, card) {
    LWTools.console("LW.construct", 3);
    this.id = id;
    this.card = card;
    this.dongle = new BTChip(this.card);    /* BTChip Instance */
    this.firmwareVersion = null;            /* BTChip Firmware Version */
    this.operationMode = null;              /* BTChip Operation Mode */
    this.wallets = new Array();             /* Contains the list of wallets */
    LWTools.console("LW.construct done", 3);

    LWTools.console("Dispatch event", 3);
    /* Event : LW.CardConnected */
    window.dispatchEvent(new CustomEvent('LW.CardConnected', { detail: {lW: this} }));
    LWTools.console("Event dispatched", 3);
}

LW.prototype = {

    constructor: LW,

    recoverFirmwareVersion : function () {
        LWTools.console("LW.recoverFirmwareVersion", 3);
        var lW = this;
        
        this.dongle.getFirmwareVersion_async().then(function(result) {
            var firmwareVersion = result['firmwareVersion'];
            if ((firmwareVersion.byteAt(1) == 0x01) && (firmwareVersion.byteAt(2) == 0x04) && (firmwareVersion.byteAt(3) < 7)) {
                LWTools.console("Using old BIP32 derivation", 2);
                lW.dongle.setDeprecatedBIP32Derivation();
            }
            if ((firmwareVersion.byteAt(1) == 0x01) && (firmwareVersion.byteAt(2) == 0x04) && (firmwareVersion.byteAt(3) < 8)) {
                LWTools.console("Using old setup keymap encoding", 2);
                lW.dongle.setDeprecatedSetupKeymap();
            }
            LWTools.console("Got firmware version " + firmwareVersion.toString(HEX), 3);
            LWTools.console("Compressed ? "+result['compressedPublicKeys'], 3);
            lW.dongle.setCompressedPublicKeys(result['compressedPublicKeys']);

            lW.firmwareVersion = firmwareVersion;

            //Event : LW.FirmwareVersionRecovered
            window.dispatchEvent(new CustomEvent('LW.FirmwareVersionRecovered', { detail: {lW: lW} }));

        }).fail(function(error) {
            LWTools.console("Firmware version not supported", 1);
            LWTools.console(error, 1);
        });
    },

    getFirmwareVersion: function(){
        LWTools.console("LW.getFirmwareVersion", 3);
        var lW = this;

        return lW.firmwareVersion.byteAt(1) + "." + lW.firmwareVersion.byteAt(2) + "." + lW.firmwareVersion.byteAt(3);
    },

    setOperationMode: function(mode){
        LWTools.console("LW.setOperationMode", 3);
        var lW = this;

        lW.dongle.setOperationMode_async(mode);
    },

    getOperationMode : function() {
        LWTools.console("LW.getOperationMode", 3);
        var lW = this;

        lW.dongle.getOperationMode_async().then(function(result){
            lW.operationMode = result;

            /* Event : LW.OperationModeRecovered */
            window.dispatchEvent(new CustomEvent('LW.OperationModeRecovered', { detail: {lW: lW} }));
        });
        
    },

    setDriverMode: function(mode){
        LWTools.console("LW.setDriverMode", 3);
        var lW = this;

        lW.dongle.setDriverMode_async(mode);
    },

    plugged : function() {
        LWTools.console("LW.plugged", 3);
        var lW = this;

        lW.dongle.getWalletPublicKey_async("0'/0/0").then(function(result) {

            /* TODO : Se connecter directement à la carte sans redemander le PIN */

            LWTools.console("PINRequired", 2);

            /* Event : LW.PINRequired */
            window.dispatchEvent(new CustomEvent('LW.PINRequired', { detail: {lW: lW} }));

        }).fail(function(error) {
           
            if (error.indexOf("6982") >= 0) {

                LWTools.console("PINRequired", 2);

                /* Event : LW.PINRequired */
                window.dispatchEvent(new CustomEvent('LW.PINRequired', { detail: {lW: lW} }));

            } else if (error.indexOf("6985") >= 0) {

                LWTools.console("BlankCard", 2);

                lW.setupCard();

            } else if (error.indexOf("6faa") >= 0) {

                LWTools.console("CardLocked", 2);

                /* Event : LW.ErrorOccured */
                window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'dongleLocked', message: error} }));
            } else {

                LWTools.console("public key fail", 1);
                LWTools.console(error, 1);

                /* Event : LW.ErrorOccured */
                window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'error', message: error} }));
            }
        });
    },

    unplugged: function(){
        LWTools.console("LW.unplugged", 3);
        var lW = this;

        lW.card = null;
    },

    reset: function(){
        LWTools.console("LW.reset", 3);
        var lW = this;

        lW.unplugged();
        LWList.checkCard();
    },

    verifyPIN: function(PIN){
        LWTools.console("LW.verifyPIN", 3);
        var lW = this;

        lW.PIN = PIN;

        lW.dongle.verifyPin_async(new ByteString(lW.PIN, ASCII)).then(function(result){

            /* Event : LW.ErrorOccured */
            window.dispatchEvent(new CustomEvent('LWPINVerified', { detail: {lW: lW} }));

            lW.getWallet();

        }).fail(function(error) {
            
            LWTools.console('Failed to connect using the PIN provided', 2);
            LWTools.console(error, 2);

            /* Event : LW.ErrorOccured */
            window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'wrongPIN', message: error} }));

            lW.reset();

        });

    },

    getWallet: function(){
        LWTools.console("LW.getWallet", 3);
        var lW = this;

        try {

            lW.dongle.getWalletPublicKey_async("0'/0/0").then(function(result) {

                lW.wallets[0] = new LWWallet(lW);
                lW.wallets[0].setAddress(result.bitcoinAddress.value);

                lW.dongle.getWalletPublicKey_async("0'/1/0").then(function(result) {

                    lW.wallets[0].setAddressChange(result.bitcoinAddress.value);
                    lW.wallets[0].loadWallet();

                    /* Event : LW.AddressChangeRecovered */
                    window.dispatchEvent(new CustomEvent('LW.AddressChangeRecovered', { detail: {lW: lW, lWWallet: lW.wallets[0]} }));

                });


            }).fail(function(error) {
                if (error.indexOf("6faa") >= 0) {

                    /* Event : LW.GetSeed */
                    window.dispatchEvent(new CustomEvent('LW.GetSeed', { detail: {lW: lW} }));

                }else{
                    LWTools.console(error, 1);
                }
            });

        }catch(e){
            LWTools.console(e, 1);
        }
    },

    setupCard : function() {
        LWTools.console("LW.setupCard", 3);
        var lW = this;

        lW.plugAction = "setup";

        /* Event : LW.SetupCardLaunched */
        window.dispatchEvent(new CustomEvent('LW.SetupCardLaunched', { detail: {lW: lW} }));

    },

    performSetup: function(pincode, restoreSeed, keyboard){
        LWTools.console("LW.performSetup", 3);
        var lW = this;

        var errors = [];
        if (lW.dongle.deprecatedSetupKeymap) {
            if ((restoreSeed.length != 0) && (restoreSeed.length != 64)) {
                errors.push('invalidSeed');
            }else if (restoreSeed.length != 0) {
                if (new ByteString(restoreSeed, HEX).length != 32) {
                    errors.push('invalidSeed');
                }
            }
        }else{
            if ((restoreSeed.length != 0) && (restoreSeed.length < 64)) {
               errors.push('invalidSeed');
            }
            if (restoreSeed.length != 0) {
                var seed = new ByteString(restoreSeed, HEX);
                if ((seed.length < 32) || (seed.length > 64)) {
                    errors.push('invalidSeed');
                }
            }
        }

        if(errors.length == 0){

            /* Event : LW.SetupCardInProgress */
            window.dispatchEvent(new CustomEvent('LW.SetupCardInProgress', { detail: {lW: lW, state: 'setup'} }));

            LWTools.console("Setup in progress ... please wait", 2);
            var keymaps = [];

            if(keyboard == 'qwerty'){
                keymaps = BTChip.QWERTY_KEYMAP_NEW;
            }else if(keyboard == 'azerty'){
                keymaps = BTChip.AZERTY_KEYMAP_NEW;
            }

            lW.dongle.setupNew_async(
                0x05,
                BTChip.FEATURE_DETERMINISTIC_SIGNATURE,
                BTChip.VERSION_BITCOIN_MAINNET,
                BTChip.VERSION_BITCOIN_P2SH_MAINNET,
                new ByteString(pincode, ASCII),
                undefined,
                keymaps,
                (restoreSeed.length != 0),
                (restoreSeed.length != 0 ? new ByteString(restoreSeed, HEX) : undefined)).then(function(result) {
                    if (restoreSeed.length == 0) {
                        LWTools.console("Plug the dongle into a secure host to read the generated seed, then reopen the extension", 2);

                        /* Event : LW.SetupCardInProgress */
                        window.dispatchEvent(new CustomEvent('LW.SetupCardInProgress', { detail: {lW: lW, state: 'readSeed'} }));

                    }
                    else {
                        LWTools.console("Seed restored, please reopen the extension", 2);

                        // lW.unplugged();
                        // LWList.checkCard();

                        /* Event : LW.SetupCardInProgress */
                        window.dispatchEvent(new CustomEvent('LW.SetupCardInProgress', { detail: {lW: lW, state: 'seedRestored'} }));
                        document.body.style.backgroundColor = "#b7ffb7";
                        LWList.lastState = "good";
                    }
            }).fail(function(errorMessage) {

                LWTools.console("setup error", 1);
                LWTools.console(errorMessage, 1);

                /* Event : LW.ErrorOccured */
                window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'errorOccuredInSetup', message: errorMessage} }));
                document.body.style.backgroundColor = "red";
            });
            
        }else{

            /* Event : LW.ErrorOccured */
            window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'performSetupInvalidData', errors: errors} }));
            document.body.style.backgroundColor = "red";
        }

    },

    forwardSetup: function(pubKey, passwordBlob){
        LWTools.console("LW.forwardSetup", 3);
        var lW = this;

        var pubkeyLength = pubKey.length / 2;
        pubkeyLength = pubkeyLength.toString(16);

        return lW.dongle.setup_forwardAsync(
            0x05, // Usually : BTChip.MODE_WALLET 
            BTChip.FEATURE_DETERMINISTIC_SIGNATURE,
            BTChip.VERSION_BITCOIN_MAINNET,
            BTChip.VERSION_BITCOIN_P2SH_MAINNET,
            pubkeyLength,
            pubKey,
            passwordBlob,
            0x00,
            0x00,
            BTChip.AZERTY_KEYMAP_NEW).then(function(result) {
                LWTools.console(result, 3);
        }).fail(function(error) {
            LWTools.console("setup error", 1);
            LWTools.console(error, 1);
        });
    },

    keycardSetup: function(keyBlock){
        LWTools.console("LW.keycardSetup", 3);
        var lW = this;

        return lW.dongle.setup_keycardAsync(keyBlock).then(function(result) {
            LWTools.console(result, 3);
            return 'done';
        }).fail(function(error) {
            LWTools.console("keycard setup error", 1);
            LWTools.console(error, 1);
        });
    },

    getBitIDAddress: function (){
        LWTools.console("LW.getBitIDAddress", 3);
        var lW = this;

        try {
            return lW.dongle.getWalletPublicKey_async("0'/0/0xb11e").then(function(result) {
                LWTools.console("BitID public key :", 3);
                LWTools.console(result, 3);
                lW.bitIdPubKey = result.publicKey;
                return result;
            }).fail(function(error) {
                LWTools.console("BitID public key fail", 2);
                LWTools.console(error, 2);

                if (error.indexOf("6982") >= 0) {

                    LWTools.console("PINRequired", 2);

                    /* Event : LW.PINRequired */
                    window.dispatchEvent(new CustomEvent('LW.PINRequired', { detail: {lW: lW} }));

                } else if (error.indexOf("6985") >= 0) {

                    LWTools.console("BlankCard", 2);

                    lW.setupCard();

                } else if (error.indexOf("6faa") >= 0) {

                    LWTools.console("CardLocked", 2);

                    /* Event : LW.ErrorOccured */
                    window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'dongleLocked', message: error} }));
                } else {

                    LWTools.console("public key fail", 1);
                    LWTools.console(error, 1);

                    /* Event : LW.ErrorOccured */
                    window.dispatchEvent(new CustomEvent('LW.ErrorOccured', { detail: {lW: lW, title: 'error', message: error} }));
                }


                return false;
            });
        }
        catch(e) {
            LWTools.console("Get public key failed", 1);
            LWTools.console(e, 1);
        }
    },

    getMessageSignature: function(message) {
        LWTools.console("LW.getMessageSignature", 3);
        var lW = this;

        if (lW.bitIdPubKey) {
            LWTools.console('signMessage ( ' + message + ')', 3);
            message = new ByteString(message,ASCII);
            pin = new ByteString(lW.PIN,ASCII);

            return lW.dongle.signMessagePrepare_async("0'/0/0xb11e", message).then(function(result) {
                return lW.dongle.signMessageSign_async(pin).then(function(result) {

                    function convertBase64(data) {
                        var codes = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                        var output = "";
                        var leven = 3 * (Math.floor(data.length / 3));
                        var offset = 0;
                        var i;
                        for (i=0; i<leven; i += 3) {
                                output += codes.charAt((data.byteAt(offset) >> 2) & 0x3f);
                                output += codes.charAt((((data.byteAt(offset) & 3) << 4) + (data.byteAt(offset + 1) >> 4)) & 0x3f);
                                output += codes.charAt((((data.byteAt(offset + 1) & 0x0f) << 2) + (data.byteAt(offset + 2) >> 6)) & 0x3f);
                                output += codes.charAt(data.byteAt(offset + 2) & 0x3f);
                                offset += 3;
                        }
                        if (i < data.length) {
                                var a = data.byteAt(offset);
                                var b = ((i + 1) < data.length ? data.byteAt(offset + 1) : 0);
                                output += codes.charAt((a >> 2) & 0x3f);
                                output += codes.charAt((((a & 3) << 4) + (b >> 4)) & 0x3f);
                                output += ((i + 1) < data.length ? codes.charAt((((b & 0x0f) << 2)) & 0x3f) : '=');
                                output += '=';
                        }
                        return output;
                    }

                    function convertMessageSignature(pubKey, message, signature) {
                        var bitcoin = new BitcoinExternal();

                        var hash = bitcoin.getSignedMessageHash(message);
                        pubKey = bitcoin.compressPublicKey(pubKey);

                        var sig;

                        for (var i=0; i<4; i++) {
                            var recoveredKey = bitcoin.recoverPublicKey(signature, hash, i);
                                recoveredKey = bitcoin.compressPublicKey(recoveredKey);
                            if (recoveredKey.equals(pubKey)) {
                                    var splitSignature = bitcoin.splitAsn1Signature(signature);
                                    sig = new ByteString(Convert.toHexByte(i + 27 + 4), HEX).concat(splitSignature[0]).concat(splitSignature[1]);
                                    break;
                            }
                        }

                        if (typeof sig == "undefined") {
                            throw "Recovery failed";
                        }

                        return convertBase64(sig);
                    }

                    var signature = result.signature;

                    try {
                        return convertMessageSignature(lW.bitIdPubKey, new ByteString(message, ASCII), signature);
                    } catch (e) {
                        LWTools.console(e, 1);
                    };
                });
            })
        } else {
            return lW.getBitIdPublicAddress().then(function(result) {
                return lW.getMessageSignature(message);
            });
        };
    },
}