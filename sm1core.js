
//#region Javascript extensions

String.prototype.trimChar = function (character, replace) {
    if (!replace)
        replace = "";
    var patt = new RegExp("^" + character + "+|" + character + "+$", "g");
    return this.replace(patt, replace);
};

String.prototype.ltrim = function () {
    return this.replace(/^\s+/, "");
};

String.prototype.rtrim = function () {
    return this.replace(/\s+$/, "");
};

String.prototype.endsWith = function (str) {
    return (this.indexOf(str) + str.length == this.length && this.indexOf(str) != -1);
};

String.prototype.startsWith = function (str) {
    return (this.indexOf(str) == 0);
};

String.prototype.lpad = function (n, padChar) {
    if (!n || n <= this.length)
        return this;
    if (!padChar)
        padChar = " ";
    return (padChar.repeat(n) + this).slice(-n);
}

String.prototype.replaceAll = function (str1, str2, ignore) {
    return this.replace(new RegExp(str1.replace(/([\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g, function (c) { return "\\" + c; }), "g" + (ignore ? "i" : "")), str2);
};

String.prototype.repeat = function (n) {
    if (!n || n === 0)
        return this;
    return Array(n + 1).join(this);
};

String.prototype.hashCode = function () {
    var hash = 0, i, ch;
    if (this.length == 0) return hash;
    for (i = 0; i < this.length; i++) {
        ch = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};

//Similarity of two strings based on levenstein distance algorithm
String.prototype.isSimilar = function (str, similarityPercent) {

    if (this.length == 0) false;
    if (str.length == 0) return false;

    if (this === str) return true;

    //if parameter is not passed, set it to 100%
    similarityPercent = typeof similarityPercent !== 'undefined' ? similarityPercent : 100;

    //start: levenstein algorithm
    var matrix = [];

    // increment along the first column of each row
    var i;
    for (i = 0; i <= str.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    var j;
    for (j = 0; j <= this.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (i = 1; i <= str.length; i++) {
        for (j = 1; j <= this.length; j++) {
            if (str.charAt(i - 1) == this.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                                        Math.min(matrix[i][j - 1] + 1, // insertion
                                                 matrix[i - 1][j] + 1)); // deletion
            }
        }
    }

    var distance = matrix[str.length][this.length];
    //end: levenstein algorithm

    var longestLength = Math.max(this.length, str.length);
    var similarity = (1 - (distance / longestLength)) * 100;

    //true if the similarity is greater than the required threshhold (usually 70%)
    return similarity > similarityPercent;
};

String.prototype.capitalizeFirstLetter = function () {
    return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
}

Date.prototype.toDate = function () {
    return new Date(this.getFullYear(), this.getMonth(), this.getDate());
};

Date.prototype.toUTCDateTime = function () {
    return new Date(this.getTime() + this.getTimezoneOffset() * 60000);
};

Date.prototype.toUTCDate = function () {
    return new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
};

Date.prototype.toDateStringInvariant = function () {
    return Ext.util.Format.leftPad((this.getMonth() + 1), 2, '0') + "/" + Ext.util.Format.leftPad(this.getDate(), 2, '0') + "/" + this.getFullYear();
};

Date.prototype.toDateString = function () {
    switch (Ext.util.Format.defaultDateFormat) {
        case "d/m/Y": return Ext.util.Format.leftPad(this.getDate(), 2, '0') + "/" + Ext.util.Format.leftPad((this.getMonth() + 1), 2, '0') + "/" + this.getFullYear();
        case "m/d/Y": return Ext.util.Format.leftPad((this.getMonth() + 1), 2, '0') + "/" + Ext.util.Format.leftPad(this.getDate(), 2, '0') + "/" + this.getFullYear();
        default: return this.toDateStringInvariant();
    }
};

Date.prototype.toDateTimeStringInvariant = function () {
    return Ext.util.Format.leftPad((this.getMonth() + 1), 2, '0') + "/" + Ext.util.Format.leftPad(this.getDate(), 2, '0') + "/" + this.getFullYear() + " " + Ext.util.Format.leftPad(this.getHours(), 2, '0') + ":" + Ext.util.Format.leftPad(this.getMinutes(), 2, '0');
};

Date.prototype.toDateTimeString = function () {
    switch (Ext.util.Format.defaultDateFormat) {
        case "d/m/Y": return Ext.util.Format.leftPad(this.getDate(), 2, '0') + "/" + Ext.util.Format.leftPad((this.getMonth() + 1), 2, '0') + "/" + this.getFullYear() + " " + Ext.util.Format.leftPad(this.getHours(), 2, '0') + ":" + Ext.util.Format.leftPad(this.getMinutes(), 2, '0');
        case "m/d/Y": return Ext.util.Format.leftPad((this.getMonth() + 1), 2, '0') + "/" + Ext.util.Format.leftPad(this.getDate(), 2, '0') + "/" + this.getFullYear() + " " + Ext.util.Format.leftPad(this.getHours(), 2, '0') + ":" + Ext.util.Format.leftPad(this.getMinutes(), 2, '0');
        default: return this.toDateTimeStringInvariant();
    }
};

Date.prototype.toShortTimeString = function () {
    var minutes = Ext.util.Format.leftPad(this.getMinutes(), 2, '0');
    var hours = Ext.util.Format.leftPad(this.getHours(), 2, '0');
    return hours.toString() + ":" + minutes.toString();
};

Date.prototype.toUTCXmlString = function () {
    var year = "" + this.getUTCFullYear();
    var month = Ext.util.Format.leftPad(this.getUTCMonth() + 1, 2, '0');
    var day = Ext.util.Format.leftPad(this.getUTCDate(), 2, '0');
    var hours = Ext.util.Format.leftPad(this.getUTCHours(), 2, '0');
    var minutes = Ext.util.Format.leftPad(this.getMinutes(), 2, '0');
    var seconds = Ext.util.Format.leftPad(this.getSeconds(), 2, '0');
    return year + "-" + month + "-" + day + "T" + hours.toString() + ":" + minutes.toString() + ":" + seconds + "Z";
};

Date.prototype.toUTCCompactDate = function () {
    var year = "" + this.getUTCFullYear();
    var month = Ext.util.Format.leftPad(this.getUTCMonth() + 1, 2, '0');
    var day = Ext.util.Format.leftPad(this.getUTCDate(), 2, '0');
    var hours = Ext.util.Format.leftPad(this.getUTCHours(), 2, '0');
    var minutes = Ext.util.Format.leftPad(this.getMinutes(), 2, '0');
    var seconds = Ext.util.Format.leftPad(this.getSeconds(), 2, '0');
    return year + month + day + hours.toString() + minutes.toString() + seconds;
};

Date.prototype.getWeek = function () {
    var determinedate = new Date();
    determinedate.setFullYear(this.getFullYear(), this.getMonth(), this.getDate());
    var D = determinedate.getDay();
    if (D == 0) D = 7;
    determinedate.setDate(determinedate.getDate() + (4 - D));
    var YN = determinedate.getFullYear();
    var ZBDoCY = Math.floor((determinedate.getTime() - new Date(YN, 0, 1, -6)) / 86400000);
    var WN = 1 + Math.floor(ZBDoCY / 7);
    return WN;
};

Date.prototype.toLocal = function () {
    var d = new Date(this.getFullYear(), this.getMonth(), this.getDate());
    var timeZoneOffset = d.getTimezoneOffset(); //offset in minutes
    if (timeZoneOffset != 0) {
        d = new Date(d.setMinutes(-timeZoneOffset));
    }
    return d;
};

Date.prototype.addDays = function (days) {
    var dat = new Date(this.valueOf());
    dat.setDate(dat.getDate() + days);
    return dat;
};

Date.prototype.isInsideInterval = function (refDate, futureDays, pastDays) {
    var future = refDate.addDays(futureDays);
    future.setHours(0, 0, 0, 0);
    if (this.valueOf() > future)
        return false;

    var past = refDate.addDays(0 - pastDays);
    past.setHours(0, 0, 0, 0);
    if (this.valueOf() < past)
        return false;

    return true;
};

Date.prototype.toJSON = (function () {
    var originalToJson = Date.prototype.toJSON;
    return function () {
        //if it's a date, don't transform it into UTC
        if (this.getHours() == 0 && this.getMinutes() == 0 && this.getSeconds() == 0 && this.getMilliseconds() == 0) {
            return this.getFullYear() + "-" + Ext.util.Format.leftPad(this.getMonth() + 1, 2, '0') + "-" + Ext.util.Format.leftPad(this.getDate(), 2, '0') + "T00:00:00.000Z";
        }
        return originalToJson.call(this);
    };
})();

// Return formatted date
Date.prototype.toString = (function (toStringFn) {
    return function (format) {
        if (format) {
            var hours = this.getHours();
            var ttime = 'AM';
            if (format.indexOf('t') > -1 && hours > 12) {
                ttime = 'PM';
            }

            var strExp = '(?=([^"]*"[^"]*")*[^"]*$)';
            var p = {
                'M{1,2}': this.getMonth() + 1,
                'd{1,2}': this.getDate(),
                'h{1,2}': hours - 12,
                'H{1,2}': hours,
                'm{1,2}': this.getMinutes(),
                's{1,2}': this.getSeconds(),
                'f{1,3}': this.getMilliseconds(),
                't{1,2}': ttime,
                'z{1,2}': this.getTimezoneOffset() / 60,
                'y{1,4}': this.getFullYear()
            };

            for (r in p) {
                if (new RegExp('(' + r + ')' + strExp).test(format)) {
                    format = format.replace(RegExp.$1,
                        '"' +
                        (RegExp.$1.length == 1
                            ? p[r]
                            : p[r].toString().lpad(RegExp.$1.length, '0')) +
                        '"'
                    );
                }
            }

            format = (format.replace(new RegExp('([a-z]+ *)' + strExp, 'gi'), ''))
                .replaceAll('"', '');

            return format;
        } else {
            return toStringFn.call(this);
        }
    }
}(Date.prototype.toString));

//#endregion

//#region XSessionStore

// XSessionStore
//
// Wrapper to session storage html5 support
//
/////////////////////////////////////
// SessionStore wrapper
function XSessionStoreImpl() {
    window.XLog = new XLogImpl();

    // Set value to storage
    this.setValue = function (key, value) {
        sessionStorage.setItem(key, value);
    };

    // Get a value from storage
    this.getValue = function (key) {
        return sessionStorage.getItem(key);
    };
}

// Singleton for XSessionStore
var XSessionStore = new XSessionStoreImpl();

//#endregion

//#region XAppStore

// XAppStore
//
// Wrapper to application storage html5 support
//
/////////////////////////////////////
// App storage wrapper
function XAppStoreImpl() {
    // Set value in storage
    this.setValue = function (key, value) {
        //Treat the following case: on some versions of Safari, empty string is converted to null.
        if (value == "")
            value = "SM1.EmptyString";
        localStorage.setItem(key, value);
    };

    // Get value from storage
    this.getValue = function (key) {
        var value = localStorage.getItem(key);
        //Treat the following case: on some versions of Safari, empty string is converted to null.
        if (value == "SM1.EmptyString")
            value = "";
        return value;
    };
}

var XAppStore = new XAppStoreImpl();

//#endregion

//#region XApp

function XAppImpl() {
    this.version = "{SM1_VERSION}"; // substituted on the fly by Manifest handler. don't change!

    this.storeLicenseInfo = function () {
        var l = XApp.license;
        XAppStore.setValue("license_licenseId", l.licenseId);
        XAppStore.setValue("license_licenseType", l.licenseType);
        XAppStore.setValue("license_licenseStatus", l.licenseStatus);
        XAppStore.setValue("license_serverId", l.serverId);
        XAppStore.setValue("license_banner", l.banner);
        XAppStore.setValue("license_expiration", l.expiration);
    }
    this.restoreLicenseInfo = function () {
        XApp.license = {
            licenseId: XAppStore.getValue("license_licenseId"),
            licenseType: XAppStore.getValue("license_licenseType"),
            licenseStatus: XAppStore.getValue("license_licenseStatus"),
            serverId: XAppStore.getValue("license_serverId"),
            banner: XAppStore.getValue("license_banner"),
            expiration: XAppStore.getValue("license_expiration")
        };
    }

    this.forceReload = function (dest) {
        if (!dest || dest == '')
            dest = 'HOME';
        sessionStorage.setItem("reload", dest);
        location.reload();
    };

    this.storeLicenseInfo = function () {
        var l = XApp.license;
        XAppStore.setValue("license_licenseId", l.licenseId);
        XAppStore.setValue("license_licenseType", l.licenseType);
        XAppStore.setValue("license_licenseStatus", l.licenseStatus);
        XAppStore.setValue("license_serverId", l.serverId);
        XAppStore.setValue("license_banner", l.banner);
        XAppStore.setValue("license_expiration", l.expiration);
    }

    this.restoreLicenseInfo = function () {
        XApp.license = {
            licenseId: XAppStore.getValue("license_licenseId"),
            licenseType: XAppStore.getValue("license_licenseType"),
            licenseStatus: XAppStore.getValue("license_licenseStatus"),
            serverId: XAppStore.getValue("license_serverId"),
            banner: XAppStore.getValue("license_banner"),
            expiration: XAppStore.getValue("license_expiration")
        };
    }

    this.checkForSessionTimeout = function () {
        if (this._lastSessionCheckDate == undefined) {
            this._lastSessionCheckDate = new Date();
            return;
        }

        var now = new Date();
        var millis = now - this._lastSessionCheckDate;
        var seconds = millis / 1000;
        var minutes = seconds / 60;
        var n = parseInt(UserContext.getConfigParam("TOUCH_SESSION_EXPIRATION_TIME", "0"), 10);
        if (n > 0 && minutes > n) {
            var msg = UserContext.tryTranslate("[MOB.SESSION_TIMEOUT]");
            alert(msg);
            location.reload();
        }

        this._lastSessionCheckDate = now;
    };

    //#region Debug Mode

    this._debugMode = false;
    this.isDebugMode = function () {
        return this._debugMode;
    };
    this.setDebugMode = function (mode) {
        this._debugMode = mode;
    };

    //#endregion

    this.environment = {
        isChrome: navigator.userAgent.toLowerCase().indexOf('chrome') > -1,
        isAndroid: navigator.userAgent.toLowerCase().indexOf('android') > -1,
        isSafari: navigator.userAgent.indexOf('Safar') > -1,
        isIE: navigator.appVersion.indexOf('Trident') >= 0,
        isEdge: navigator.userAgent.toLowerCase().indexOf('edge') > -1
    };

    // Bug 43067
    // Exception thrown by: webkitPersistentStorage()
    // Description: The user-agent-string sent by Microsoft Edge contains 'chrome' substring
    //              but webkit methods are missing.
    if (navigator.userAgent.toLowerCase().indexOf('edge') > -1) {
        this.environment.isChrome = false;
        this.environment.isIE = true;
    }

    //#region Dates

    this.isEmptyDate = function (d) {
        if (XApp.isEmptyOrWhitespaceString(d))
            return true;

        if (d.indexOf) {
            try {
                d = new Date(d);
            } catch (e) {
                return false;
            }
        }
        return d - 0 <= Constants.SM1MINDATE - 0;
    };

    this.dateDiff = function (minDate, maxDate, diffType) {
        switch (diffType) {
            case "s":
                return (maxDate - minDate) / 1000;
            case "m":
                // Nr of miliseconds in a minute
                return (maxDate - minDate) / 60000;
            case "h":
                // Nr of miliseconds in a hour
                return (maxDate - minDate) / 3600000;
            case "d":
                // Nr of milliseconds in a day
                return (maxDate - minDate) / 86400000;
            default:
                throw new Error("unsupported date diff type " + diffType);
        }
    };

    this.dateAdd = function (date, offset, offsetType) {
        var msOffSet = 0;

        switch (offsetType) {
            case "s":
                msOffSet = 1000 * offset;
                break;
            case "m":
                // Nr of miliseconds in a minute
                msOffSet = 60000 * offset;
                break;
            case "h":
                // Nr of miliseconds in a hour
                msOffSet = 3600000 * offset;
                break;
            case "d":
                // Nr of milliseconds in a day
                msOffSet = 86400000 * offset;
                break;
            default:
                throw new Error("unsupported date offset type " + offsetType);
        }

        date = new Date(date.getTime() + msOffSet);
        return date;
    };

    this.today = function () {
        var n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    };

    this.dateFromString = function (strDate) {
        var convertedDate = strDate;

        // convert from DateTimeExt or string
        if (strDate.indexOf) {
            convertedDate = new Date(strDate);

            //relative date to current time
            if (strDate.indexOf("NOW") == 0) {
                convertedDate = new Date();
                var val = parseInt(strDate.substring(3).trim(), 10);
                if (val) {
                    convertedDate.setDate(convertedDate.getDate() + val);
                }
            } else if (strDate.indexOf("TODAY") == 0) {
                convertedDate = XApp.today();
                var val = parseInt(strDate.substring(5).trim());
                if (val) {
                    convertedDate.setDate(convertedDate.getDate() + val);
                }
            }
        }

        return convertedDate;
    };

    //checks if a string is in format 'hh:mm - hh:mm' and hours are ok
    this.timeIntervalIsValid = function (workInterval) {
        var regex = /^([0-1][0-9]|[2][0-3]):([0-5][0-9]([\s]*))\s-\s([0-1][0-9]|[2][0-3]):([0-5][0-9]([\s]*))$/;

        if (!regex.test(workInterval)) //format check
            return false;

        var firstTimeIntervalArray = workInterval.substr(0, workInterval.indexOf("-")).trim().split(':'); //first hh:mm
        var secondTimeIntervalArray = workInterval.substr(workInterval.indexOf("-") + 1).trim().split(':'); //second hh:mm

        var firstTimeIntervalInSeconds = firstTimeIntervalArray[0] * 3600 + firstTimeIntervalArray[1] * 60;
        var secondTimeIntervalInSeconds = secondTimeIntervalArray[0] * 3600 + secondTimeIntervalArray[1] * 60;

        if (XApp.dateDiff(firstTimeIntervalInSeconds, secondTimeIntervalInSeconds, 's') <= 0)
            return false;

        return true;
    }

    // Given a time interval in minutes, transform it in a string with it's representation in hours and minutes
    this.durationToString = function (duration) {
        if (duration == 0)
            return null;

        var hours = Math.floor(duration / 60);
        var minutes = duration % 60;

        var result = "";
        if (hours > 0) {
            result = hours == 1 ? hours + " " + UserContext.tryTranslate("[MOB.ROUTES.DURATIONHOUR]") : hours + " " + UserContext.tryTranslate("[MOB.ROUTES.DURATIONHOURS]");
            result += " ";
        }

        if (minutes > 0) {
            result += minutes == 1 ? minutes + " " + UserContext.tryTranslate("[MOB.ROUTES.DURATIONMIN]") : minutes + " " + UserContext.tryTranslate("[MOB.ROUTES.DURATIONMINS]");
            result += " ";
        }

        return result;
    };

    // Given a time interval in minutes, transform it in a string with it's representation in hours and minutes in a short format (Ex: 2h 34min)
    this.durationToStringShort = function (duration) {
        if (duration == 0)
            return null;

        var hours = Math.floor(duration / 60);
        var minutes = duration % 60;

        var result = "";
        if (hours > 0) {
            result = hours + " " + UserContext.tryTranslate("[MOB.ROUTES.DURATIONHOURSHORT]");
            result += " ";
        }

        if (minutes > 0) {
            result += minutes + " " + UserContext.tryTranslate("[MOB.ROUTES.DURATIONMIN]");
            result += " ";
        }

        return result;
    };

    // Returns the ISO week of the date.
    // Aligned with the Organizer's method of returning the week number
    this.firstDayOfWeek = function (year, weekNumber) {
        //set start date to january the 1st of the given year
        var startDate = new Date(year, 0, 1);
        var step = 1;

        // Thursday in current week decides the year.
        // if the first of January of the given year is past thursday,
        // then go forward to the next monday, otherwise go backward to previous monday
        if (startDate.getDay() <= 4)
            step = -1;

        //get to the first monday of the given year
        while (startDate.getDay() != UserContext.firstDayOfWeek) {
            startDate.setDate(startDate.getDate() + step);
        }

        return this.dateAdd(startDate, ((weekNumber - 1) * 7), 'd');
    };

    this.lastDayOfWeek = function (year, weekNumber) {
        return this.dateAdd(this.firstDayOfWeek(year, weekNumber), 6, 'd');
    };

    this.firstDayOfMonth = function (year, monthNumber) {
        return new Date(year, monthNumber, 1);
    }

    this.lastDayOfMonth = function (year, monthNumber) {
        return new Date(year, monthNumber + 1, 0);
    };

    this.getWeekCust = function (date) {
        var weekFromCalendar = UserContext.getConfigParam("WEEKFROMCALENDAR", "0");
        var day = SalesExecutionEngine.getCalendarDay(date);
        if (weekFromCalendar == 0 || XApp.isEmptyOrWhitespaceString(day) || day.get("WEEKCUST") == "0")
            return date.getWeek();
        else
            return day.get("WEEKCUST");
    };

    this.getFirstDayOfWeek = function (date) {
        var weekDay = new Date(date);
        while (weekDay.getDay() != 1)
            weekDay.setDate(weekDay.getDate() - 1);
        return weekDay;
    };
    //#endregion

    //#region Strings
    this.isEmptyString = function (str) {
        if (str == undefined || str == null)
            return true;
        if (str == "") return true;
        if (str.toString && str.toString() == "") return true;

        return false;
    };

    this.isEmptyOrWhitespaceString = function (str) {
        if (str == undefined || str == null)
            return true;
        if (str === "") return true;
        if (str.toString && str.toString().trim() === "") return true;

        return false;
    };
    //#endregion

    //#region Numbers
    this.toDecimals = function (value, decimals) {
        return parseFloat(value.toFixed(decimals));
    };

    this.truncateToDecimals = function (value, decimals) {
        var multiplier = Math.pow(10, decimals);
        return Math.floor(value * multiplier) / multiplier;
    };

    this.getDecimalsCount = function (value) {
        if (!value.toString)
            return 0;

        var strVal = value.toString();
        var separator = null;
        if (strVal.indexOf(".") >= 0)
            separator = ".";
        else if (strVal.indexOf(",") >= 0)
            separator = ",";

        if (separator == null)
            return 0;

        return strVal.split(separator)[1].length;
    };

    // Checks whether there is anything after the decimal point
    this.hasDecimals = function (value) {
        return value % 1 != 0;
    };

    this.isNum = function (n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    };
    //#endregion

    //#region images

    //Checks if an image's extension is supported
    this.isImage = function (name) {
        name = name.toUpperCase();
        if (name.endsWith(".JPG"))
            return true;
        if (name.endsWith(".JPEG"))
            return true;
        if (name.endsWith(".GIF"))
            return true;
        if (name.endsWith(".PNG"))
            return true;
        if (name.endsWith(".BMP"))
            return true;
        return false;
    }
    //#endregion

    //#region Fixed messages
    this.uiMessages = {
        "it": {
            "LOGIN": "Accedi",
            "USER": "Utente",
            "DOMAIN": "Dominio",
            "PWD": "Password",
            "IMPERSONATE": "Impersona Utente",
            "IMPERSONATEDUSER": "Impersonato",
            "SELECT_USER_IMPERSONATE": "Seleziona utente da impersonare",
            "NO_IMP_USERS": "Nessun utente da impersonare",
            "SETTINGS": "Impostazioni",
            "BTLOGIN": "Login",
            "PRELOGIN_ERR": "Impossibile contattare il server: \nContinuare non connessi ?",
            "LOADING": "Loading",
            "BACK": "Indietro",
            "GENERAL": "Generale",
            "DB": "Db",
            "FS": "FS",
            "CLIENT_INFO": "Info Client",
            "VERSION": "Versione",
            "BROWSER_CULTURE": "Lingua browser",
            "CLIENT_IP": "IP Client",
            "ONLINE": "Online",
            "MAPS_AVAILABLE": "Mappe disponibili",
            "FORCE_OFFLINE": "Forza modalità offline",
            "SERVER_INFO": "Info Server",
            "SERVER_IP": "IP Server",
            "SERVER_PATH": "Server Path",
            "SERVER_VERSION": "Versione Server",
            "SOURCE_TIMESTAMP": "Data generazione codice JS",
            "INFO": "Informazioni",
            "CLEAR_DB": "Cancella Db",
            "ESTIMATED_SIZE": "Stima dimensioni",
            "SHOW_FILES": "Mostra Files",
            "CLEAR_STORAGE": "Cancella Tutto",
            "USED": "Usato",
            "QUOTA": "Massimo",
            "TRUE": "Vero",
            "FALSE": "Falso",
            "DEBUG_MODE": "Modalità debug",
            "LICENSE": "Licenza",
            "LICENSE_INFO": "Dettagli Licenza",
            "LICENSE_ID": "ID Licenza",
            "LICENSE_TYPE": "Tipo Licenza",
            "LICENSE_STATUS": "Stato",
            "SERVER_ID": "ID Server",
            "BANNER": "Titolo",
            "EXPIRATION": "Scadenza",
            "LOSE_DATA": "L'azione seguente causerà la perdita di dati locali",
            "LOSE_DATA_CONTINUE": "Vuoi continuare?",
            "LOSE_DATA_YES": "Sì",
            "LOSE_DATA_NO": "No",
            "LOSE_DATA_DIFFERENT_USER": "I dati del dispositivo sono da un altro utente: ",
            "LOSE_DATA_CURRENT_USER": " I dati presenti sul dispositivo saranno aggiornati con i dati di: ",
            "APP_WILL_RESTART": "L'applicazione non ha dati nella cache e si riavvia",
            "DEVICE_LOADS_CACHED_DATA_FROM": "Il dispositivo caricherà i dati memorizzati nella cache da: "
        },
        "en": {
            "LOADING": "Loading",
            "LDAPEXPIRE": "LDAP password soon to expire",
            "LDAPEXPIRE2": "Your active directory password will expire in {0} days. Do you want to update your password now?",
            "LDAPEXPDAYS": "Your active directory password will expire in {0} days",
            "LDAP_NO": "No",
            "LDAP_YES": "Yes",
            "LDAP_OK": "Ok",
            "LOGIN": "Log In",
            "USER": "User",
            "DOMAIN": "Domain",
            "PWD": "Password",
            "IMPERSONATE": "User Switch",
            "IMPERSONATEDUSER": "Impersonated",
            "SELECT_USER_IMPERSONATE": "Select user to switch to",
            "NO_IMP_USERS": "No users found to switch",
            "SETTINGS": "Settings",
            "BTLOGIN": "Login",
            "PRELOGIN_ERR": "Unable to contact server: \nGo offline ?",
            "LOADING": "Loading",
            "BACK": "Back",
            "GENERAL": "General",
            "DB": "Db",
            "FS": "FS",
            "CLIENT_INFO": "Client Info",
            "VERSION": "Version",
            "BROWSER_CULTURE": "Browser culture",
            "CLIENT_IP": "Client IP",
            "ONLINE": "Online",
            "MAPS_AVAILABLE": "Maps avaiable",
            "FORCE_OFFLINE": "Force offline mode",
            "SERVER_INFO": "Server Info",
            "SERVER_IP": "Server IP",
            "SERVER_PATH": "Server Path",
            "SERVER_VERSION": "Server version",
            "SOURCE_TIMESTAMP": "JS Source Timestamp",
            "INFO": "Info",
            "CLEAR_DB": "Clear Db",
            "ESTIMATED_SIZE": "Estimated Size",
            "SHOW_FILES": "Show Files",
            "CLEAR_STORAGE": "Clear All",
            "USED": "Used",
            "QUOTA": "Max",
            "TRUE": "True",
            "FALSE": "False",
            "DEBUG_MODE": "Debug Mode",
            "LICENSE": "License",
            "LICENSE_INFO": "License Info",
            "LICENSE_ID": "License ID",
            "LICENSE_TYPE": "License Type",
            "LICENSE_STATUS": "License Status",
            "SERVER_ID": "Server ID",
            "BANNER": "Banner",
            "EXPIRATION": "Expiration",
            "RESTART_FOR_SYNC": "Restart to continue synchronization",
            "LOSE_DATA": "The following action will cause the loss of local data",
            "LOSE_DATA_CONTINUE": "Do you wish to continue?",
            "LOSE_DATA_YES": "Yes",
            "LOSE_DATA_NO": "No",
            "LOSE_DATA_DIFFERENT_USER": "The data on your device is from another user:  ",
            "LOSE_DATA_CURRENT_USER": " Device data will be updated with the data from: ",
            "APP_WILL_RESTART": "The application has no cached data and will restart",
            "DEVICE_LOADS_CACHED_DATA_FROM": "The device will load cached data from: ",
            "MOB_WARN": "Warning",
            "MULTIPLE_INSTANCES": "There is another open session.",
            "ERROR": "Error",
            "OK": "Ok"
        },
        "es": {
            "LOGIN": "Bienvenida",
            "USER": "User",
            "DOMAIN": "Domain",
            "PWD": "Password",
            "SETTINGS": "Settings",
            "BTLOGIN": "Login",
            "PRELOGIN_ERR": "Unable to contact server: \nGo offline ?",
            "LOADING": "Loading"
        },
        "fr": {
            "LOGIN": "Bienvenue",
            "USER": "Utilisateur",
            "DOMAIN": "Domaine",
            "PWD": "Mot de Passe",
            "IMPERSONATE": "Remplacer",
            "IMPERSONATEDUSER": "Utilisateur Remplacé",
            "SELECT_USER_IMPERSONATE": "Sélectionner l’utilisateur à remplacer",
            "NO_IMP_USERS": "Utilisateur non trouvé",
            "SETTINGS": "Paramètres",
            "BTLOGIN": "Login",
            "PRELOGIN_ERR": "Impossible de contacter le serveur: \nBasculer en mode hors connexion?",
            "LOADING": "Chargement",
            "BACK": "Retour",
            "GENERAL": "Général",
            "DB": "Base",
            "FS": "FS",
            "CLIENT_INFO": "Info Client",
            "VERSION": "Version",
            "BROWSER_CULTURE": "Browser culture",
            "CLIENT_IP": "Adresse IP client",
            "ONLINE": "Connecté",
            "MAPS_AVAILABLE": "Carte Disponible",
            "FORCE_OFFLINE": "Forcer mode hors connexion",
            "SERVER_INFO": "Info Serveur",
            "SERVER_IP": "Adresse IP Serveur",
            "SERVER_PATH": "Chemin Serveur",
            "SERVER_VERSION": "Version Serveur",
            "SOURCE_TIMESTAMP": "Date/heure version JS",
            "INFO": "Info",
            "CLEAR_DB": "Effacer Db",
            "ESTIMATED_SIZE": "Taille Estimée",
            "SHOW_FILES": "Montrer Fichiers",
            "CLEAR_STORAGE": "Effacer tout",
            "USED": "Utilisé",
            "QUOTA": "Max",
            "TRUE": "Vrai",
            "FALSE": "Faux",
            "DEBUG_MODE": "Mode Debug",
            "LICENSE": "Licence",
            "LICENSE_INFO": "Info Licence",
            "LICENSE_ID": "N° Licence",
            "LICENSE_TYPE": "Type Licence",
            "LICENSE_STATUS": "Statut Licence",
            "SERVER_ID": "N° Serveur",
            "BANNER": "Enseigne",
            "EXPIRATION": "Expiration",
            "RESTART_FOR_SYNC": "Redémarrer pour achever la synchronisation",
            "LOSE_DATA": "les Données seront Perdues",
            "LOSE_DATA_CONTINUE": "Continuez",
            "LOSE_DATA_YES": "Oui",
            "LOSE_DATA_NO": "Non",
            "LOSE_DATA_DIFFERENT_USER": "Les Données des Utilisateurs seront Perdues: ",
            "LOSE_DATA_CURRENT_USER": "Les Données de L'Utilisateur Actuel seront Perdues: ",
            "APP_WILL_RESTART": "L'application n'a pas de données mises en cache et redémarre",
            "DEVICE_LOADS_CACHED_DATA_FROM": "L'appareil charge les données en cache de: ",
            "MOB_WARN": "Alerte"
        },
        "de": {
            "LOGIN": "Einloggen",
            "USER": "Benutzer",
            "DOMAIN": "Domäne",
            "PWD": "Passwort",
            "IMPERSONATE": "Benutzer wechseln",
            "SETTINGS": "Einstellungen",
            "BTLOGIN": "Anmeldung",
            "PRELOGIN_ERR": "Server kann nicht kontaktiert werden: \nGehe offline ?",
            "LOADING": "Ladevorgang",
            "BACK": "Zurück",
            "GENERAL": "Allgemein",
            "DB": "Db",
            "FS": "FS",
            "CLIENT_INFO": "Kundeninfo",
            "VERSION": "Ausführung",
            "BROWSER_CULTURE": "Spracheinstellungen Browser",
            "CLIENT_IP": "Client IP",
            "ONLINE": "Online",
            "MAPS_AVAILABLE": "Karten verfügbar",
            "FORCE_OFFLINE": "Offline Modus erzwingen",
            "SERVER_INFO": "Server Info",
            "SERVER_IP": "Server IP",
            "SERVER_PATH": "Server Pfad",
            "SERVER_VERSION": "Server version",
            "SOURCE_TIMESTAMP": "JS Source Timestamp",
            "INFO": "Info",
            "CLEAR_DB": "Daten löschen",
            "ESTIMATED_SIZE": "Geschätzte Größe",
            "SHOW_FILES": "Zeige Dateien",
            "CLEAR_STORAGE": "Alles löschen",
            "USED": "Gebraucht",
            "QUOTA": "Max",
            "TRUE": "Wahr",
            "FALSE": "Falsch",
            "DEBUG_MODE": "Debug-Modus",
            "LICENSE": "Lizenz",
            "LICENSE_INFO": "Lizenzinfo",
            "LICENSE_ID": "Lizenz-ID",
            "LICENSE_TYPE": "Lizenz-Typ",
            "LICENSE_STATUS": "Lizenzstatus",
            "SERVER_ID": "Server ID",
            "BANNER": "Banner",
            "EXPIRATION": "Ablauf",
            "RESTART_FOR_SYNC": "Starten Sie neu, um die Synchronisierung fortzusetzen",
            "LOSE_DATA": "Die folgende Aktion führt zum Verlust lokaler Daten",
            "LOSE_DATA_CONTINUE": "Möchten Sie fortfahren?",
            "LOSE_DATA_YES": "Ja",
            "LOSE_DATA_NO": "Nein",
            "LOSE_DATA_DIFFERENT_USER": "Die Daten auf Ihrem Gerät stammen von einem anderen Benutzer",
            "LOSE_DATA_CURRENT_USER": " Gerätedaten werden mit den Daten von aktualisiert: ",
            "APP_WILL_RESTART": "Die Anwendung hat keine zwischengespeicherten Daten und wird neu gestartet",
            "DEVICE_LOADS_CACHED_DATA_FROM": "Das Gerät lädt zwischengespeicherte Daten von: ",
            "DEVICE_WILL_WORK_OFFLINE": "Das Gerät arbeitet offline",
            "CONNECTION_REQUIRED_TO_CHANGE_USER": "Verbindung erforderlich, um Benutzer zu ändern",
            "MOB_WARN": "Warnung",
            "MULTIPLE_INSTANCES": "Es gibt eine weitere offene Sitzung.",
            "ERROR": "Error",
            "OK": "Ok"
        },
        "ar": {
            "LOGIN": "مرحبا بكم",
            "USER": "المستخدم",
            "DOMAIN": "المجال",
            "PWD": "كلمات السر",
            "IMPERSONATE": "تبديل المستخدم",
            "IMPERSONATEDUSER": "تم التبديل",
            "SELECT_USER_IMPERSONATE": "اختار المستخدم للتبديل",
            "NO_IMP_USERS": "لايوجد مستخدم للتبديل",
            "SETTINGS": " تعليمات",
            "BTLOGIN": "تسجيل الدخول",
            "PRELOGIN_ERR": "لا يمكن الاتصال بالسيرفير: \nالمواصلة بدون إتصال؟",
            "LOADING": "تحميل",
            "BACK": "عودة",
            "GENERAL": "عام",
            "DB": "قاعدة البيانات",
            "FS": "فايل سيستيم",
            "CLIENT_INFO": "لغة المتصفح",
            "VERSION": "الإصدار",
            "BROWSER_CULTURE": "لغة المتصفح",
            "CLIENT_IP": "كلاينت آي بي ",
            "ONLINE": "متصل بالشبكة",
            "MAPS_AVAILABLE": "الخرائط المتوفرة",
            "FORCE_OFFLINE": "إلزام الإنقطاع عن الشبكة",
            "SERVER_INFO": "معلومات المخدم",
            "SERVER_IP": "عنوان المستخدم",
            "SERVER_PATH": "مسار المخدم",
            "SERVER_VERSION": "إصدار المخدم",
            "SOURCE_TIMESTAMP": "تاريخ إنشاء كود جافا سكربت",
            "INFO": "معلومات",
            "CLEAR_DB": "حذف قاعدة البيانات",
            "ESTIMATED_SIZE": "الحجم التقديري",
            "SHOW_FILES": "إظهار الملفات",
            "CLEAR_STORAGE": "حذف البيانات",
            "USED": "مستخدم",
            "QUOTA": "الحد الأقصى",
            "TRUE": "صحيح",
            "FALSE": "خطأ",
            "DEBUG_MODE": "طريقة التصحيح",
            "LICENSE": "صلاحيات",
            "LICENSE_INFO": "معلومات الصلاحية",
            "LICENSE_ID": "تعريف الصلاحية",
            "LICENSE_TYPE": "تعريف الصلاحية",
            "LICENSE_STATUS": "حالة الصلاحية",
            "SERVER_ID": "تعريف المخدم ",
            "BANNER": "الشعار",
            "EXPIRATION": "تاريخ الإنتهاء ",
            "RESTART_FOR_SYNC": "اعد التشغيل لاكمال المزامنة"
        }
    }
    this.uiMessages["it-it"] = this.uiMessages["it"];
    this.uiMessages["en-us"] = this.uiMessages["en"];
    this.uiMessages["es-es"] = this.uiMessages["es"];
    this.uiMessages["fr-fr"] = this.uiMessages["fr"];
    this.uiMessages["de-de"] = this.uiMessages["de"];
    this.uiMessages["ar-ar"] = this.uiMessages["ar"];

    this.translateLocalMessage = function (code) {
        if (!this.localUIMessages[code]) {
            if (!(this.uiMessages["en"])[code])
                return "[" + code + "]";
            return (this.uiMessages["en"])[code];
        }
        return this.localUIMessages[code];
    };

    this.setLoginCulture = function (ui) {
        if (ui == null || ui == undefined || ui == "")
            ui = (navigator.language || navigator.userLanguage).toLowerCase();
        this.localUIMessages = this.uiMessages[ui];
        if (this.localUIMessages == undefined)
            this.localUIMessages = this.uiMessages["en"];

        XAppStore.setValue("LOGINCULTURE", ui);
    };

    var ui = XAppStore.getValue("LOGINCULTURE");
    this.setLoginCulture(ui);

    //#endregion

    //#region User Trace
    // Last known user position
    this.lastKnownPos = {
        lat: 0,
        lng: 0,
        err: ""
    };

    this.offlineCoordArray = [];
    this.offlineCoordinates = "";

    // Get the current position
    // onFailure(error)
    // onSuccess(position)
    this.getCurrentPosition = function (onFailure, onSuccess) {
        var self = this;
        navigator.geolocation.getCurrentPosition(function (position) {
            self.lastKnownPos.lat = position.coords.latitude;
            self.lastKnownPos.lng = position.coords.longitude;
            self.lastKnownPos.err = "";
            if (onSuccess != null) {
                onSuccess(position);
            }
        }, function (error) {
            self.lastKnownPos.lat = 0;
            self.lastKnownPos.lng = 0;
            self.lastKnownPos.err = error.code;
            if (onFailure != null) {
                onFailure(new Error(error.code));
            }
        },
            {
                enableHighAccuracy: UserContext.getConfigParam('TOUCH_GEOLOCATION_HIGHACCURACY', Constants.TOUCH_GEOLOCATION_HIGHACCURACY) != 0 ? true : false,
                maximumAge: UserContext.getConfigParam('TOUCH_GEOLOCATION_MAXAGE', Constants.TOUCH_GEOLOCATION_MAXAGE),
                timeout: UserContext.getConfigParam('TOUCH_GEOLOCATION_TIMEOUT', Constants.TOUCH_GEOLOCATION_TIMEOUT)
            });
    };

    this.getCoordinates = function (onSuccess) {
        var geolocationOptions = {
            enableHighAccuracy: UserContext.getConfigParam('TOUCH_GEOLOCATION_HIGHACCURACY', Constants.TOUCH_GEOLOCATION_HIGHACCURACY) != 0 ? true : false,
            maximumAge: UserContext.getConfigParam('TOUCH_GEOLOCATION_MAXAGE', Constants.TOUCH_GEOLOCATION_MAXAGE),
            timeout: UserContext.getConfigParam('TOUCH_GEOLOCATION_TIMEOUT', Constants.TOUCH_GEOLOCATION_TIMEOUT),
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (position) {
                onSuccess(position.coords.latitude, position.coords.longitude);
            },
            function (err) {
                XLog.logWarn("Unable to get current location" + (!err || XApp.isEmptyOrWhitespaceString(err.message) ? "" : " : " + err.message));
                //TODO - because geolocation API does not always fire this callback only once when location cannot be retrieved
                //some kind of test should be implemented in order to ensure that call to onSuccess callback is executed only once.
                //if (!err || (err && err.code == 3))
                onSuccess(null, null);
            },
            geolocationOptions);
        } else {
            XLog.logErr("Geolocation is not supported/activated.");
            onSuccess(null, null);
        }
    };

    this.startTraceLocation = function () {
        var self = this;
        var trace = UserContext.getConfigParam("TRACE_TOUCH_USR_POSITION_INTERVAL", "");

        XDbStore.getValue("offlineCoordinatesArray", function (data) {
        }, function (data) {
            self.offlineCoordinates = data;
        });

        if (trace == "0")
            return;
        if (trace == "") {
            setTimeout(function () {
                self.startTraceLocation();
            }, 2000);
            return;
        }
        trace = parseInt(trace, 10) * 60000;
        this.getCurrentPosition(null, null);
        setInterval(function () {
            self.getCurrentPosition(null, null);
        }, trace);
    };


    //#endregion

    //#region Customizers

    this.customizers = {};

    this.registerExtension = function (custType, name, cust) {
        this.customizers[name + "Extension"] = cust;
        cust.base = null;
        cust.base = this.customizers[custType];
    };

    this.registerExtensionCust = function (custType, name, cust) {
        this.customizers[name + "ExtensionCust"] = cust;
        cust.base = null;

        if (this.customizers[name + "Extension"]) {
            cust.base = this.customizers[name + "Extension"];
        } else {
            cust.base = this.customizers[custType];
        }
    };

    this.registerNavigatorExtension = function (name, cust) {
        this.registerExtension("navCustomizer", name, cust);
    };

    this.registerNavigatorExtensionCust = function (name, cust) {
        this.registerExtensionCust("navCustomizer", name, cust);
    };

    this.registerDocumentExtension = function (name, cust) {
        this.registerExtension("docCustomizer", name, cust);
    };

    this.registerDocumentExtensionCust = function (name, cust) {
        this.registerExtensionCust("docCustomizer", name, cust);
    };

    this.registerGuiExtension = function (name, cust) {
        this.registerExtension("guiCustomizer", name, cust);
    };

    this.registerGuiExtensionCust = function (name, cust) {
        this.registerExtensionCust("guiCustomizer", name, cust);
    };

    this.getCust = function (custType, custName, method) {
        var cust = this.customizers[custName + "ExtensionCust"];
        if (cust != undefined && cust[method] == undefined)
            cust = null;
        if (cust == null) {
            cust = this.customizers[custName + "Extension"];
            if (cust != undefined && cust[method] == undefined)
                cust = null;
        }
        if (cust == null) {
            cust = this.customizers[custType];
        }

        if (!cust)
            return null;
        return cust;
    };

    this.callCust = function (custType, custName, method, args) {
        var cust = this.getCust(custType, custName, method);

        if (!cust)
            return undefined;

        if (args && args.push == undefined)
            args = [args];
        return this.exec(cust[method], args, cust);
    };

    //helps identify the customizer for a ui transition
    this.extractUiCustMetadata = function (histConfig) {
        var meta = {
            custType: "",
            custName: ""
        };

        if (histConfig.controller == app.getSM1Controllers().gui) {
            meta.custType = "guiCustomizer";
            meta.custName = histConfig.guiName;
        }
        else if (histConfig.controller == app.getSM1Controllers().nav) {
            meta.custType = "navCustomizer";
            meta.custName = histConfig.id;
        }

        return meta;
    };

    //#endregion

    //#region Online/Offline


    this._netCheck = navigator.onLine;
    // Check online status of the web app
    this.isOnline = function () {

        //Full offline mode was forced
        if (!this._online) {
            return false;
        }

        //When the application is working full offline, the "XAPP.ISONLINE" variable should be directly linked to the browser connectivity status
        if (UserContext.isFullOfflineMode()) {
            return ((navigator.onLine && this._netCheck) || this.isHomeLocalHost());
        }
        else {

            if (!((navigator.onLine && this._netCheck) || this.isHomeLocalHost())) {
                this.forceOfflineMode();
                XUI.showErrorMsgBox({
                    msg: UserContext.tryTranslate("[MOB.CONN_UNAVAILABLE]")
                });
            }

            return this._online;
        }
    };

    //Override navigator online/offline state
    this.forceOfflineMode = function () {
        this._online = false;
    };

    //Reset overriden navigator online/offline state
    this.resetForcedOfflineMode = function () {
        this._online = true;
    };

    this.canSwitchOnline = function () {
        if (!((navigator.onLine && this._netCheck) || this.isHomeLocalHost()))
            return false;
        var t = XHttpHelper.getLastPingTime();
        return (t == -1) || (t >= 0 && t < 3000);
    };

    this.goOnline = function () {
        if (!this.canSwitchOnline())
            return false;
        this._online = true;
        window.forcedRestart = true;
        return true;
    };

    //#endregion

    //#region Url related utilities

    //open URL
    this.openURL = function (url, onClose) {
        try {
            if (iOSWrapper.isWrapperAvailable()) {
                // Actually onClose is not managed by iOS App...
                iOSWrapper.openUrl(url);
            } else if (AndroidWrapper.isAvailable())
                AndroidWrapper.openUrl(url);
            else if (XApp.environment.isIE && url.startsWith('blob')) {
                //for IE, send the file for download/open
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'blob';
                xhr.onload = function (e) {
                    var blob = e.target.response;
                    navigator.msSaveOrOpenBlob(blob);
                    XApp.exec(onClose);
                };
                xhr.send();
            }
            else {
                //var winObj = window.open(url, "_blank");
                var iframe = "<iframe width='95%' height='95%' style='border-width: 0px;' src='" + url + "'></iframe>";
                var winObj = window.open();
                winObj.document.open();
                winObj.document.write(iframe);
                winObj.document.close();
                if (winObj && onClose) {
                    var loop = setInterval(function () {
                        if (winObj.closed) {
                            clearInterval(loop);
                            XApp.exec(onClose);
                        }
                    }, 1000);
                }
            }
        } catch (e) {
            XLog.logEx(e);
        }
    };

    // Read a page's GET URL variables and return them as an associative array.
    this.getUrlVars = function () {
        var vars = [], hash;
        var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
        for (var i = 0; i < hashes.length; i++) {
            hash = hashes[i].split('=');
            vars.push(hash[0]);
            vars[hash[0]] = hash[1];
        }
        return vars;
    };

    this.getUrlVar = function (name) {
        return this.getUrlVars()[name];
    };

    this.getHomeUrl = function () {
        return window.location.href.substring(0, window.location.href.indexOf("/Client/"));
    };

    this.isHomeLocalHost = function () {
        var u = window.location.href.toUpperCase();
        return u.indexOf("LOCALHOST") > -1 || u.indexOf("127.0.0.1") > -1;
    };

    //#endregion

    //#region Orientation

    this.getScreenSize = function () {
        return {
            width: Ext.Viewport.getWindowWidth(),
            height: Ext.Viewport.getWindowHeight()
        };
    };

    //#endregion

    //#region json

    this.stringToJSON = function (s) {
        var o = Ext.decode(s);
        if (!Ext.isObject(o) && !Ext.isArray(o))
            return o;
        var fixObj = function (obj) {
            for (var k in obj) {
                var value = obj[k];
                if (Ext.isString(value)) {
                    if (value.length == 24 || value.length == 20) {
                        if (value.endsWith('T00:00:00Z') || value.endsWith('T00:00:00.000Z')) {
                            var s = value.substr(0, value.indexOf("T"));
                            var year = s.substring(0, s.indexOf("-"));
                            var month = s.substring(s.indexOf("-") + 1, s.lastIndexOf("-")) - 1;
                            var day = s.substring(s.lastIndexOf("-") + 1);
                            obj[k] = new Date(year, month, day);
                        } else if (value[4] == '-' && value[7] == '-' && value[10] == 'T' && value[13] == ':' && value[16] == ':' && (value[19] == 'Z' || value[23] == 'Z'))
                            obj[k] = new Date(value);
                    }
                } else {
                    if (Ext.isObject(value) || Ext.isArray(value)) {
                        fixObj(value);
                    }
                }
            }
            return obj;
        };

        return fixObj(o);
    };

    //#endregion

    this.delegate = function (fn, scope, args, appendArgs) {
        return Ext.Function.bind(fn, scope, args, appendArgs);
    };

    this.exec = function (fn, args, scope) {
        if (!fn)
            return null;
        return fn.apply(scope, args);
    };

    this.ensureProps = function (obj, configs) {
        if (obj == null || obj == undefined)
            return configs;
        for (var p in configs) {
            if (!obj.hasOwnProperty(p))
                obj[p] = configs[p];
        }
        return obj;
    };

    this.startPing = function () {
        var self = this;
        var interval = UserContext.getConfigParam("TOUCH_PING_INTERVAL", "");
        if (interval == "0")
            return;
        if (interval == "") {
            setTimeout(function () {
                self.startPing();
            }, 12000);
            return;
        }
        interval = parseInt(interval, 10) * 60000;
        XHttpHelper.ping();
        setInterval(function () {
            XHttpHelper.ping();
        }, interval);
    };

    this.startNetCheck = function () {
        var self = this;
        var interval = UserContext.getConfigParam("TOUCH_NETCHECK_INTERVAL", "0");
        if (interval == "0")
            return;
        if (interval == "") {
            setTimeout(function () {
                self.startNetCheck();
            }, 10000);
            return;
        }
        interval = parseInt(interval, 10) * 1000;
        XHttpHelper.netCheck();
        setInterval(function () {
            XHttpHelper.netCheck();
        }, interval);
    };

    //#region GUID
    this._lastTimeStamp = 0;
    //GUID = Time Stamp (century time )
    //Returns a string with maximum 14 or 15 characters depending on the current time.
    this.newGUID = function () {
        //getTime should return return something between 13 and 14 digits (at least untill a resonable year like 2300)
        //two rapid consecutive call to newGUID could yeld same result if done in same millisecond
        //we loop until we get a new timestamp
        var timeStamp = (new Date()).getTime().toString();
        while (timeStamp == this._lastTimeStamp)
            timeStamp = (new Date()).getTime().toString();
        this._lastTimeStamp = timeStamp;
        return timeStamp;
    };

    // 30 position unique id = User code on 15 positions padded to the left with 0 + XApp.newGUID on 15 positions padded to the left with 0
    this.newUserGUID = function (codUsr) {
        if (!codUsr)
            codUsr = UserContext.CodUsr;
        var trimmedCodUsr = codUsr.trim();
        if (trimmedCodUsr.length > 15) //user codes might have fixed prefixes
            trimmedCodUsr = trimmedCodUsr.substring(trimmedCodUsr.length - 15);

        return Ext.String.leftPad(trimmedCodUsr, 15, '0') + Ext.String.leftPad(XApp.newGUID(), 15, '0');
    }
    //#endregion

    //#region GlobalData

    this.GlobalData = {};

    this.loadGlobalData = function (onFailure, onSuccess) {
        XCache.getFile("GlobalData.json", 'CNFG',
            onFailure,
            function (data, hash) {
                try {
                    if (data != null) {
                        XApp.GlobalData = JSON.parse(data);
                        if (XApp.GlobalData.CALENDARS) {
                            for (var d in XApp.GlobalData.CALENDARS) {
                                var t = new XDataTable();
                                t.fromJsonData(XApp.GlobalData.CALENDARS[d]);
                                XApp.GlobalData.CALENDARS[d] = t;
                            }
                        }
                        XApp.model = new XModel();
                    } else {
                        XApp.GlobalData = {};
                        XApp.model = {};
                    }
                } catch (e) {
                    onFailure(e);
                    return;
                }
                onSuccess();
            }
        );
    };

    //#endregion

    this.checkMapsApi = function () {
        if (!XApp.isOnline())
            return false;
        return XGoogleAPI.isMapLoaded();
    };


    // Converte la stringa contente un operatore relazionale con l'enumerativo corrispondente
    // <param name="s">operatore come stringa</param>
    // <returns>Operatore</returns>
    this.strToRelationalOperator = function (s) {
        switch (s.toUpperCase()) {
            case "=":
            case "EQUAL":
                return SqlRelationalOperator.Equal;
            case "!=":
            case "<>":
            case "NOTEQUAL":
                return SqlRelationalOperator.NotEqual;
            case "<":
            case "LESS":
                return SqlRelationalOperator.Less;
            case "<=":
            case "LESSOREQUAL":
                return SqlRelationalOperator.LessOrEqual;
            case ">":
            case "GREATER":
                return SqlRelationalOperator.Greater;
            case ">=":
            case "GREATEROREQUAL":
                return SqlRelationalOperator.GreaterOrEqual;
            case "IN":
                return SqlRelationalOperator.In;
            case "IS NOT NULL":
            case "ISNOTNULL":
                return SqlRelationalOperator.IsNotNull;
            case "IS NULL":
            case "ISNULL":
                return SqlRelationalOperator.IsNull;
            case "LIKE":
                return SqlRelationalOperator.Like;
            case "ULIKE":
                return SqlRelationalOperator.ULike;
            case "NOTULIKE":
                return SqlRelationalOperator.NotULike;
            case "NOTIN":
            case "NOT IN":
                return SqlRelationalOperator.NotIn;
            case "NOTLIKE":
            case "NOT LIKE":
                return SqlRelationalOperator.NotLike;
            default:
                throw new XtelException("Unknown relational operator " + s);
        }
    };


    // convert string to logical operator
    // <returns>Operatore</returns>
    this.strToLogicalOperator = function (s) {
        switch (s.toUpperCase()) {
            case "AND":
                return SqlLogicalOperator.And;
            case "OR":
                return SqlLogicalOperator.Or;
            case "NOT":
                return SqlLogicalOperator.Not;
            default:
                throw new XtelException("Unknown logical operator " + s);
        }
    };
    //Map an object to a string
    this.mapToString = function (o) {
        if (!o)
            return "";
        if (typeof o === 'string') {
            return o;
        }
        return o.toString();
    };

    // ApplyRelationalOperator
    this.applyRelationalOperator = function (v1, op, v2) {

        switch (op) {
            case SqlRelationalOperator.Equal:
            case "=":
                if (v1 instanceof Date)
                    return XApp.compare(v1, "=", v2, "DateTime");
                if (v1 === true)
                    return v2 != false && (v2 == true || v2 !== 0); //even if it seems redundant the condition v2 != false is needed because without it if v1=true and v2=false condition v2 == true || v2 !== 0 will evaluate to true because of (false!==0) = true
                if (v1 === false)
                    return v2 != true && (v2 == false || v2 === 0);
                if (v2 === true)
                    return v1 != false && (v1 == true || v1 !== 0);
                if (v2 === false)
                    return v1 != true && (v1 == false || v1 === 0);
                return v1 == v2;
            case SqlRelationalOperator.NotEqual:
            case "!=":
            case "<>":
                if (v1 instanceof Date)
                    return XApp.compare(v1, "!=", v2, "DateTime");
                if (v1 === true)
                    return v2 != true && (v2 == false || v2 === 0);
                if (v1 === false)
                    return v2 != false && (v2 == true || v2 !== 0);
                if (v2 === true)
                    return v1 != true && (v1 == false || v1 === 0);
                if (v2 === false)
                    return v1 != false && (v1 == true || v1 !== 0);
                return v1 != v2;
            case SqlRelationalOperator.Less:
            case "<":
                if (v1 instanceof Date)
                    return XApp.compare(v1, "<", v2, "DateTime");
                return v1 < v2;
            case SqlRelationalOperator.LessOrEqual:
            case "<=":
                if (v1 instanceof Date)
                    return XApp.compare(v1, "<=", v2, "DateTime");
                return v1 <= v2;
            case SqlRelationalOperator.Greater:
            case ">":
                if (v1 instanceof Date)
                    return XApp.compare(v1, ">", v2, "DateTime");
                return v1 > v2;
            case SqlRelationalOperator.GreaterOrEqual:
            case ">=":
                if (v1 instanceof Date)
                    return XApp.compare(v1, ">=", v2, "DateTime");
                return v1 >= v2;
            case SqlRelationalOperator.Like:
                return this.mapToString(v1).indexOf(this.mapToString(v2)) != -1;
            case SqlRelationalOperator.NotLike:
                return !(this.mapToString(v1).indexOf(this.mapToString(v2)) != -1);
            case SqlRelationalOperator.ULike:
                return this.mapToUString(v1).indexOf(this.mapToUString(v2)) != -1;
            case SqlRelationalOperator.NotULike:
                return !(this.mapToUString(v1).indexOf(this.mapToUString(v2)) != -1);
            case SqlRelationalOperator.In:
                switch (Object.prototype.toString.call(v2)) {
                    case '[object Object]':
                        if (v2[v1])
                            return true;
                        return false;
                    case '[object Array]':
                        for (var i = 0; i < v2.length; i++) {
                            var o = v2[i];
                            if (this.applyRelationalOperator(v1, SqlRelationalOperator.Equal, o))
                                return true;
                        }
                        return false;
                    default:
                        var values = this.mapToString(v2).split("|$");
                        for (var i = 0; i < values.length; i++) {
                            var o = values[i];
                            if (!XApp.isEmptyOrWhitespaceString(o))
                                if (this.applyRelationalOperator(v1, SqlRelationalOperator.Equal, o, null))
                                    return true;
                        }
                        return false;
                }
            case SqlRelationalOperator.NotIn:
                return !this.applyRelationalOperator(v1, SqlRelationalOperator.In, v2);
            case SqlRelationalOperator.IsNull:
                return this.mapToString(v1).length == 0;
            case SqlRelationalOperator.IsNotNull:
                return this.mapToString(v1).length != 0;
            case SqlRelationalOperator.StartWith:
                return this.mapToString(v1).indexOf(this.mapToString(v2)) == 0;
            case SqlRelationalOperator.NotStartWith:
                return (this.mapToString(v1).indexOf(this.mapToString(v2)) != 0);
            case SqlRelationalOperator.UStartWith:
                return this.mapToUString(v1).indexOf(this.mapToUString(v2)) == 0;
            case SqlRelationalOperator.NotUStartWith:
                return this.mapToUString(v1).indexOf(this.mapToUString(v2)) != 0;
            case SqlRelationalOperator.Contains:
                return this.mapToString(v1).indexOf(this.mapToString(v2)) != -1;
            case SqlRelationalOperator.NotContains:
                return this.mapToString(v1).indexOf(this.mapToString(v2)) == -1;
            case SqlRelationalOperator.UContains:
                return this.mapToUString(v1).indexOf(this.mapToUString(v2)) != -1;
            case SqlRelationalOperator.NotUContains:
                return this.mapToUString(v1).indexOf(this.mapToUString(v2)) == -1;
            case SqlRelationalOperator.UEqual:
                return this.mapToUString(v1) == this.mapToUString(v2);
            case SqlRelationalOperator.NotUEqual:
                return this.mapToUString(v1) != this.mapToUString(v2);
            default:
                throw new Error("Unsupported eval for " + op.toString());
        }
    };

    this.getPrimitiveValue = function (type, value) {
        switch (type) {
            case "string":
            case "":
                return value.toString();
            case "DateTime":
            case "DateTimeExt":
                return XApp.dateFromString(value);
            case "int":
            case "double":
            case "float":
            case "long":
            case "decimal":
                return new Number(value);
            case "bool":
                return value != "0";
            case "object":
                if (Object.prototype.toString.call(value) === '[object Object]')
                    return value;
                var keys = {};
                if (!(Object.prototype.toString.call(value) === '[object Array]'))
                    var s = XApp.mapToString(value).split("|$");
                else
                    var s = value;
                for (var i = 0; i < s.length; i++) {
                    keys[s[i]] = true;
                }
                return keys;
            default:
                throw new Error("getPrimitiveValue Unsupported type " + type);
        }
    };

    //Map an object to an UPPERCASE string
    this.mapToUString = function (o) {
        return this.mapToString(o).toUpperCase();
    };

    this.compare = function (v1, op, v2, referenceType) {
        if (v1 == null && v2 == null) {
            switch (op) {
                case "=":
                    return true;
                default:
                    return false;
            }
        }

        if (v1 == null || v2 == null) {
            return false;
        }

        switch (referenceType) {
            case "Decimal":
                v1 = parseFloat(v1);
                v2 = parseFloat(v2);
                switch (op) {
                    case "=":
                        return v1 == v2;
                    case "<":
                        return v1 < v2;
                    case "<=":
                        return v1 <= v2;
                    case ">":
                        return v1 > v2;
                    case ">=":
                        return v1 >= v2;
                    case "<>":
                    case "!=":
                        return !(v1 == v2);
                    default:
                        throw new Error("Unknown op " + op + " for type " + referenceType);
                }
            case "Long":
                switch (op) {
                    case "=":
                        return v1 == v2;
                    case "<":
                        return v1 < v2;
                    case "<=":
                        return v1 <= v2;
                    case ">":
                        return v1 > v2;
                    case ">=":
                        return v1 >= v2;
                    case "<>":
                    case "!=":
                        return !(v1 == v2);
                    default:
                        throw new Error("Unknown op " + op + " for type " + referenceType);
                }
            case "Int":
                v1 = parseInt(v1, 10);
                v2 = parseInt(v2, 10);
                switch (op) {
                    case "=":
                        return v1 == v2;
                    case "<":
                        return v1 < v2;
                    case "<=":
                        return v1 <= v2;
                    case ">":
                        return v1 > v2;
                    case ">=":
                        return v1 >= v2;
                    case "<>":
                    case "!=":
                        return !(v1 == v2);
                    default:
                        throw new Error("Unknown op " + op + " for type " + referenceType);
                }
            case "DateTime":
                var convertedDate = v2;
                // convert v2 from DateTimeExt or string
                if (v2.indexOf) {
                    convertedDate = XApp.dateFromString(v2);
                }
                switch (op) {
                    case "=":
                        return (v1 - convertedDate) == 0;
                    case "<":
                        return (v1 - convertedDate) < 0;
                    case "<=":
                        return (v1 - convertedDate) <= 0;
                    case ">":
                        return (v1 - convertedDate) > 0;
                    case ">=":
                        return (v1 - convertedDate) >= 0;
                    case "<>":
                    case "!=":
                        return (v1 - convertedDate) != 0;
                    default:
                        throw new Error("Unknown op " + op + " for type " + referenceType);
                }
            case "String":
                switch (op) {
                    case "=":
                        return v1 == ("" + v2);
                    case "<":
                        return v1 < ("" + v2);
                    case "<=":
                        return v1 <= ("" + v2);
                    case ">":
                        return v1 > ("" + v2);
                    case ">=":
                        return v1 >= ("" + v2);
                    case "<>":
                    case "!=":
                        return !(v1 == ("" + v2));
                    default:
                        throw new Error("Unknown op " + op + " for type " + referenceType);
                }
            default:
                throw new Error("Unknown Type " + referenceType);
        }
    };

    this.objectDescription = function (valueObject, template) {
        var i;
        var path = /\@[^\@]+@/gi;
        var fields = template.match(path);
        if (fields == null)
            return "";
        for (i = 0; i < fields.length; i++) {
            fields[i] = fields[i].substring(1, fields[i].length - 1);
        }
        for (i = 0; i < fields.length; i++) {
            var f = fields[i];
            var value = valueObject.get(f);
            template = template.replace("@" + f + "@", value);
        }
        return template;
    };

    this.isPhone = function () {
        return XApp.getDeviceType() == DeviceType.Phone;
    };

    this.isTablet = function () {
        return XApp.getDeviceType() == DeviceType.Tablet;
    };

    this.isDesktop = function () {
        return XApp.getDeviceType() == DeviceType.Desktop;
    };

    this.getDeviceType = function () {
        try {
            return Ext.os.deviceType;
        } catch (ex) {
            return DeviceType.Desktop;
        }
    };


    this.getCssAttribute = function (selectorText, attributeName, sheetName) {
        for (var i = 0, l = document.styleSheets.length; i < l; i++) {
            if (sheetName) {
                if (!document.styleSheets[i].href || document.styleSheets[i].href.indexOf(sheetName) == -1)
                    continue;
            }
            var classes = document.styleSheets[i].rules || document.styleSheets[i].cssRules;
            if (!classes) continue;
            for (var x = 0; x < classes.length; x++) {
                var rule = classes[x];
                if (rule.selectorText == selectorText) {
                    return rule.style[attributeName];
                }
            }
        }
    };

    this.print = function (printText) {
        var printInfo;
        var debugString = UserContext.isDebug ? "1" : "0";
        var baudRate = UserContext.getConfigParam("ZEBRA_BAUD_RATE");

        var translations =
           {
               "BluetoothNotFound": UserContext.tryTranslate("[MOB.PRINT.BLTNOTFOUND]"),
               "BLTENABLE": UserContext.tryTranslate("[MOB.PRINT.BLTENABLE]"),
               "BLTDISABLE": UserContext.tryTranslate("[MOB.PRINT.BLTDISABLE]"),
               "SRCPRINTER": UserContext.tryTranslate("[MOB.PRINT.SRCPRINTER]"),
               "PRINTERFOUND": UserContext.tryTranslate("[MOB.PRINT.PRINTERFOUND]"),
               "NOPRINTERFOUND": UserContext.tryTranslate("[MOB.PRINT.NOPRINTERFOUND]"),
               "DISCONNECTING": UserContext.tryTranslate("[MOB.PRINT.DISCONNECTING]"),
               "NOTCONNECTED": UserContext.tryTranslate("[MOB.PRINT.NOTCONNECTED]"),
               "COMERR": UserContext.tryTranslate("[MOB.PRINT.COMERR]"),
               "CONNECTING": UserContext.tryTranslate("[MOB.PRINT.CONNECTING]"),
               "CONNECTED": UserContext.tryTranslate("[MOB.PRINT.CONNECTED]"),
               "SENDDATA": UserContext.tryTranslate("[MOB.PRINT.SENDDATA]"),
               "SEARCHPRINT": UserContext.tryTranslate("[MOB.PRINT.SEARCHPRINT]"),
               "EXITBUTTON": UserContext.tryTranslate("[MOB.PRINT.EXITBUTTON]"),
               "PRINTBUTTON": UserContext.tryTranslate("[MOB.PRINT.PRINTBUTTON]")
           };
        var transString = JSON.stringify(translations);

        if (!AndroidWrapper.isAvailable()) {
            var blob = new Blob([printText]);
            var fileName = "printcmd_" + (new Date().getUTCMilliseconds()) + "" + new Date().valueOf() + ".txt";
            FileUtils.saveFile(blob, fileName);
            XApp.openURL("intent://VIEW/#Intent;scheme=zebraPrinter;package=com.xtel.printer.app;S.myextra=" + fileName + ";S.DBG=" + debugString + ";S.trans=" + transString + ";S.baudRate=" + baudRate + ";end");
        } else {
            AndroidWrapper.print(printText, transString, debugString, baudRate);
        }
    };

    this.isRTL = function () {
        var rtl = XApp.getUrlVar("RTL");
        return rtl && rtl == 1;
    };

    this.getCssCalc = function (calc) {
        return Ext.browser.is.WebKit ? '-webkit-calc(' + calc + ')' : 'calc(' + calc + ')';
    };

    //Restart SM1
    this.restart = function () {
        window.location.replace("SM1.aspx" + location.search);
    };

    this.htmlEscapeCharRegExp = /(\&|\"|\<|\>)/ig;

    this.htmlEncode = function (html) {
        if (!this.isString(html))
            return html;

        return html.replace(this.htmlEscapeCharRegExp, function () {
            var w = '';
            for (var i = 0; i < arguments.length; i++) {
                if (i <= 0 || i >= arguments.length - 2) {
                    // Skip first argument because it is the whole match, same for the last argument
                    // which is the text in which the replace will be done
                    continue;
                } else if (arguments[i] == '&') {
                    w += '&amp;';
                } else if (arguments[i] == '"') {
                    w += '&quot;';
                } else if (arguments[i] == '<') {
                    w += '&lt;';
                } else if (arguments[i] == '>') {
                    w += '&gt;';
                } else {
                    return arguments[i];
                }
            }
            return w;
        });
        //var regExpStr = '(<)(\/?.*?)(>)';
        //if (allowFormatting) {
        //    regExpStr = '(<)((?!\/?b|strong|i|em|mark|small|del|ins|sub|sup|br(?=>|\s.*>))\/?.*?)(>)';
        //}
        //return html.replace(new RegExp(regExpStr, 'ig'), function (match, idx, text) {
        //    console.log(match);
        //    if (match == '<') {
        //        return '&lt;';
        //    } else if (match == '>') {
        //        return '&gt;';
        //    } else {
        //        return match;
        ////    }
        //});
    };
    this.isMaliciousHtml = function (html) {
        if (!this.isString(html))
            return;

        // Check for malicious tags
        var maliciousTags = ['iframe', 'script', 'img'];
        for (var i = 0; i < maliciousTags.length; i++) {
            var tag = maliciousTags[i];
            var tagIdx = html.indexOf('<' + tag);
            if (tagIdx != -1) {
                var nextTagChar = html[tagIdx + tag.length + 1];
                if (nextTagChar == ' ' || nextTagChar == '/' || nextTagChar == '>') {
                    return true;
                }
            }
        }
        // Check for malicious attributes
        if (html.match(/\<.*?\son[\w\d]+\=[\"\']/i))
            return true;

        return false;
    };
    this.mangleMaliciousHtml = function (html) {
        return this.isMaliciousHtml(html) ? this.htmlEncode(html) : html;
    };
    this.isString = function (obj) {
        if (obj === undefined)
            return false;
        if (obj === null)
            return false;
        return obj.toLowerCase !== undefined;
    };

    this.obfuscateString = function (str) {
        // Get UTF-16 string bytes
        var bytes = str.getBytes();
        // For each byte decrease the value by 3 (ex: 1(byte value)-3(x)=254)
        // IMPORTANT: The new value should be in range 0..255
        for (var i = 0; i < bytes.length; i++)
            bytes[i] = (((255 + (bytes[i] - 3)) % 255) % 255);
        // Convert to UTF-8 string and then encode to base64
        return btoa(bytes.map(function (byte) {
            return String.fromCharCode(byte);
        }).join(''));
    };

    this.deobfuscateString = function (str) {
        // Decode string from base64 (we are expecting UTF-8 string) and then read bytes
        var bytes = atob(str).split('').map(function (char) {
            return char.charCodeAt(0);
        });
        // For each byte increase the value by 3 (ex: 254(byte value)+3(x)=1)
        // IMPORTANT: The new value should be in range 0..255
        for (var i = 0; i < bytes.length; i++)
            bytes[i] = (((255 + (bytes[i] + 3)) % 255) % 255);
        // Recreate UTF-16 string
        return String.fromByteArray(bytes);
    };

    String.prototype.getBytes = function () {
        var bytes = [];
        for (var i = 0; i < this.length; i++) {
            // Get the decimal value of the charater
            var c = this.charCodeAt(i);
            // Get first 8 bites using a mask
            // 0xFF equals 0b11111111
            bytes.push(c & 0xFF);
            // Get next 8 bites using a mask
            // 0xFF00 equals 0b1111111100000000
            bytes.push((c & 0xFF00) >> 8);
        }
        return bytes;
    };

    String.fromByteArray = function (arr) {
        if (arr.length < 2)
            return '';
        if (arr.length % 2 != 0)
            arr.push(0);
        var str = [];
        for (var i = 0; i < arr.length; i += 2) {
            var byte1 = arr[i];
            var byte2 = arr[i + 1];
            str.push(String.fromCharCode((byte2 << 8) + byte1));
        }
        return str.join('');
    };
}

//#endregion
var XApp = new XAppImpl();
var dbgMode = XApp.getUrlVar("DBG");
XApp.setDebugMode(!XApp.isEmptyOrWhitespaceString(dbgMode) && (dbgMode == "1" || dbgMode.toString().toLowerCase() == "true"));
XApp._online = (XApp.getUrlVar("OFFLINE") == "1" ? false : true);   //True otherwise, because XApp.isOnline should decide the state when it's called


//#region Google Map API support

function XGoogleAPIImp() {

    //#region Private
    this._mapsLoaded = false;
    this._loadMapsTimer = null;
    this._loadMapsTimer2 = null;
    this._googleAPIKey = null;

    this._fixWindowsTabletGoogleMapsTouchSupport = function () {
        if (Ext.browser.is.chrome && Ext.os.is.windows && Ext.feature.has.Touch) {
            navigator.msMaxTouchPoints = navigator.msMaxTouchPoints || 2;
            navigator.msPointerEnabled = true;
        }
    }

    this._loadMaps = function () {
        var self = this;
        if (window.console) window.console.info("Loading maps API (2)...");
        if (this._loadMapsTimer != null) {
            clearTimeout(this._loadMapsTimer);
            this._loadMapsTimer = null;
        }
        //AJAX API is loaded successfully. Now lets load the maps api
        var key = self.getGoogleKeyStringForRequest();
        google.load("maps", "3", { other_params: key, "callback": self._mapLoaded });
        this._loadMapsTimer2 = setTimeout(function () { self._loadMaps(); }, 10000);
    };

    this._mapLoaded = function () {
        if (window.console) window.console.info("Maps API Ok");
        XGoogleAPI._fixWindowsTabletGoogleMapsTouchSupport();
        XGoogleAPI._mapsLoaded = true;
        if (XGoogleAPI._loadMapsTimer2 != null) {
            clearTimeout(XGoogleAPI._loadMapsTimer2);
            XGoogleAPI._loadMapsTimer2 = null;
        }
    };

    //#endregion Private

    //#region Public

    this.init = function () {
        var googleAPIKey = serverInfo.appSettings.GOOGLEAPIKEY;
        XGoogleAPI.setGoogleAPIKey(googleAPIKey);
    }

    this.isMapLoaded = function () {
        return XGoogleAPI._mapsLoaded;
    };

    this.loadMapsApi = function (attempts, n) {
        var self = this;

        if (self._mapsLoaded == true) {
            return;
        } else if (!XApp.isNum(attempts)) {
            attempts = 5;
        } else if (attempts <= 0) {
            return;
        }

        if (!XApp.isNum(n)) {
            n = attempts;
        }

        google = null;

        if (window.console) {
            window.console.info('Loading maps API (' + (n - attempts + 1) + ' try out of ' + n + ')...');
        }

        if (!navigator.onLine || !XApp._netCheck) {
            if (window.console) {
                window.console.info('No network connectivity... maps disabled');
            }

            return;
        }

        var script = document.createElement('script');
        var key = self.getGoogleKeyStringForRequest();
        // fix mady Google Map in touch DAL 05/12/2020
        script.src = location.protocol + '//maps.googleapis.com/maps/api/js?callback=onGoogleMapsAPILoaded&' + key;
        script.type = 'text/javascript';
        document.getElementsByTagName('head')[0].appendChild(script);
        self._loadMapsTimer = setTimeout(function () {
            self.loadMapsApi(attempts - 1, n);
        }, 10000);
    };
    //Method to get the Key MADY 05/12/2020
    this.getGoogleKeyStringForRequest = function () {
        var self = this;
        var key = self.getGoogleAPIKey();
        return key == "" ? "" : "key=" + key;
    }

    this.getGoogleAPIKey = function () {
        return this._googleAPIKey;
    };

    this.setGoogleAPIKey = function (key) {
        this._googleAPIKey = key;
    }
    //#endregion Public
};

var XGoogleAPI = new XGoogleAPIImp();

function onGoogleMapsAPILoaded() {
    XGoogleAPI._loadMaps();
}