//#region _mobGuiPharmaStudy
function _mobGuiPharmaStudy() {
    this.afterNewDocument = function (gui, options) {
        var self = this;
        self._startNewStudy(gui);
    };

    this._startNewStudy = function (gui) {
        var self = this;
        var navRow = gui.openData.selectedNavRow;
        var doc = gui.getDocument();

        doc.initKey();
        //copy data from navigator row
        doc.set("CODUSR", navRow.get("CODUSR"));
        doc.set("CODPARTY", navRow.get("CODPARTY"));
        doc.set("IDMISSION", navRow.get("IDMISSION"));
        doc.set("CODDIV", navRow.get("CODDIV"));

        WFEngine.initWorkflow(doc);
        self._autoFillDates(gui, doc.get("IDWFSTATE"));
    },

    //auto fill date fields based on passed state
    this._autoFillDates = function (gui, state) {
        var doc = gui.getDocument();
        var navRow = gui.openData.selectedNavRow;
        var visitData = gui.openData.visitData;
        var today = new Date().toDate();
        switch (state) {
            case SalesExecutionNameSpace.StudyWFState.STARTED:
                if (XApp.isEmptyDate(doc.get("DTESTART"))) {
                    var autoFillValue = visitData ? visitData.dteVisit.toDate() : today;
                    //autofill with today/visit date if it is valid, or with the date when the study starts
                    doc.set("DTESTART", navRow.get("DTEFROM").toDate() <= autoFillValue && autoFillValue <= navRow.get("DTEMAXSTART").toDate() ? autoFillValue : navRow.get("DTEFROM").toDate());
                }
                break;
            case SalesExecutionNameSpace.StudyWFState.PAPERRETURNED:
                if (XApp.isEmptyDate(doc.get("DTEPAPERRETURNED"))) {
                    doc.set("DTEPAPERRETURNED", doc.get("DTESTART").toDate() <= today && today <= navRow.get("DTERETSTUDY").toDate() ? today : doc.get("DTESTART").toDate());
                }
                break;
            case SalesExecutionNameSpace.StudyWFState.PAPERRECEIVED:
                if (XApp.isEmptyDate(doc.get("DTEPAPERRECEIVED"))) {
                    doc.set("DTEPAPERRECEIVED", doc.get("DTEPAPERRETURNED").toDate() <= today ? today : doc.get("DTEPAPERRETURNED").toDate());
                }
                break;
            case SalesExecutionNameSpace.StudyWFState.INVOICERECEIVED:
                if (XApp.isEmptyDate(doc.get("DTEINVOICERECEIVED"))) {
                    doc.set("DTEINVOICERECEIVED", doc.get("DTEPAPERRECEIVED").toDate() <= today && today <= navRow.get("DTEINVSTUDY").toDate() ? today : doc.get("DTEPAPERRECEIVED").toDate());
                }
                break;
            case SalesExecutionNameSpace.StudyWFState.CANCELLED:
                if (XApp.isEmptyDate(doc.get("DTESTUDYCANCELLED"))) {
                    doc.set("DTESTUDYCANCELLED", today);
                }
                break;
            default: break;
        };
    };

    this.preFillSection = function (sectionContext) {
        var self = this;
        var sectionName = sectionContext.config.attrs["caption"];
        switch (sectionName) {
            case "MISSION_ATTACHMENTS":
                {
                    sectionContext.document = sectionContext.gui.m_mission;
                    sectionContext.config.attrs["editable"] = "false";
                    break;
                }
            case "DOCTOR_INFO":
                sectionContext.entityName = 'DoctorInfo';
                var e = self.createDoctorInfoEntity(sectionContext.document);
                sectionContext.entity = e;
                break;
            default:
                break;
        }
    };

    this.afterCardFieldCreation = function (field, context) {
        var guiName = context.sectionContext.gui.guiName;
        var entityName = context.sectionContext.entityName;
        var fieldName = field.fieldContext.fieldName;

        switch (context.fieldConfig.attrs['name']) {
            case "DESPARTY1":
            case "DESPARTY2":
                var desField = UserContext.tryTranslate("[" + guiName + "." + entityName + "." + fieldName + "]");
                field.setLabel(desField);
                break;
        }
        return field;
    };

    this.getDocumentDescription = function (context) {
        var doc = context.document;
        if (!doc)
            return "";
        var pharmaStudyRow = XNavHelper.getFromMemoryCache("NAV_MOB_SE_PHARMASTUDY").findByConstraints(new XConstraint("IDMISSION", "=", doc.get("IDMISSION")));

        if (pharmaStudyRow)
            return pharmaStudyRow.get("DESMISSION");
        return "";
    };

    this.createDoctorInfoEntity = function (doc) {
        var entity = new XEntity({ entityName: 'DoctorInfo' });
        var doctorRow = XNavHelper.getFromMemoryCache("NAV_MOB_DOCTORS").findByConstraints(new XConstraint("CODPARTY", "=", doc.get("CODPARTY")));
        if (doctorRow != undefined) {
            entity.set("DESTITLE", doctorRow.get("DESTITLE"));
            entity.set("DESPARTY1", doctorRow.get("DESPARTY1"));
            entity.set("DESPARTY2", doctorRow.get("DESPARTY2"));
            entity.set("NUMPHONE1", doctorRow.get("NUMPHONE1"));
            entity.set("NUMPHONE2", doctorRow.get("NUMPHONE2"));
            entity.set("NUMFAX1", doctorRow.get("NUMFAX1"));
            entity.set("EMAIL1", doctorRow.get("EMAIL1"));
        }
        return entity;
    };

    //extra validation logic on top of configuration
    this._validateStudyField = function (study, mission, navRow, fieldName, fieldValue) {
        var valid = true;
        var errorReport = undefined;
        switch (fieldName) {
            case "DTESTART":
                valid = XApp.isEmptyDate(fieldValue) || (fieldValue >= mission.get("DTEFROM") && fieldValue <= mission.get("DTETO"));
                if (!valid) {
                    errorReport = {
                        fieldName: fieldName,
                        caption: UserContext.tryTranslate("[MOBGUIPHARMASTUDY.DTESTART_OUTSIDE_INTERVAL]")
                    };
                }
                else {
                    // must be >= last start date
                    valid = (XApp.isEmptyDate(navRow.get("DTESTART")) || fieldValue >= navRow.get("DTESTART"))
                            && (fieldValue <= study.get("DTEPAPERRETURNED") || XApp.isEmptyDate(study.get("DTEPAPERRETURNED")));
                    if (!valid) {
                        errorReport = {
                            fieldName: fieldName,
                            caption: UserContext.tryTranslate("[PHARMASTUDY." + fieldName + "]")
                        }
                    }
                }
                break;
            case "DTEPAPERRETURNED":
                valid = XApp.isEmptyDate(fieldValue) || (fieldValue <= mission.get("DTERETSTUDY"));
                if (!valid) {
                    errorReport = {
                        fieldName: fieldName,
                        caption: UserContext.tryTranslate("[MOBGUIPHARMASTUDY.DTEPAPERRETURNED_EXCEDEED]")
                    };
                }
                else {
                    valid = XApp.isEmptyDate(fieldValue) || (fieldValue >= study.get("DTESTART") || XApp.isEmptyDate(study.get("DTESTART")));
                    if (!valid) {
                        errorReport = {
                            fieldName: fieldName,
                            caption: UserContext.tryTranslate("[PHARMASTUDY." + fieldName + "]")
                        }
                    }
                }
                break;
            case "DTEPAPERRECEIVED":
                valid = XApp.isEmptyDate(fieldValue)
                        || (fieldValue >= study.get("DTEPAPERRETURNED") && fieldValue <= mission.get("DTEINVSTUDY"))|| XApp.isEmptyDate(study.get("DTEPAPERRETURNED"));
                if (!valid) {
                    errorReport = {
                        fieldName: fieldName,
                        caption: UserContext.tryTranslate("[PHARMASTUDY." + fieldName + "]")
                    }
                }
                break;
            case "DTEINVOICERECEIVED":
                valid = XApp.isEmptyDate(fieldValue) || (fieldValue <= mission.get("DTEINVSTUDY"));
                if (!valid) {
                    errorReport = {
                        fieldName: fieldName,
                        caption: UserContext.tryTranslate("[MOBGUIPHARMASTUDY.DTEINVOICERECEIVED_EXCEDEED]")
                    };
                }
                else {
                    valid = XApp.isEmptyDate(fieldValue) || (fieldValue >= study.get("DTEPAPERRECEIVED") || XApp.isEmptyDate(study.get("DTEPAPERRECEIVED")));
                    if (!valid) {
                        errorReport = {
                            fieldName: fieldName,
                            caption: UserContext.tryTranslate("[PHARMASTUDY." + fieldName + "]")
                        }
                    }
                }
                break;
        }
        return errorReport;
    };


    this.setFieldStatus = function (context) {
        var self = this;
        var fieldContext = context.field.fieldContext;
        var study = fieldContext.sectionContext.entity;
        var mission = context.gui.gui.m_mission;
        var navRow = context.gui.gui.openData.selectedNavRow;
        switch (context.fieldName) {
            case "DTESTART":
            case "DTEPAPERRETURNED":
            case "DTEPAPERRECEIVED":
            case "DTEINVOICERECEIVED":
                if (context.valid) {
                    var errReport = self._validateStudyField(study, mission, navRow, context.fieldName, context.field.getValue());
                    if (errReport) {
                        context.valid = false;
                        context.field.fieldContext.caption = errReport.caption;
                    }
                }
                break;
        }
    };

    this.onEndEditEnded = function (ctrl, fieldName, newValue) {
        switch (fieldName) {
            case "DTESTART":
            case "DTEPAPERRETURNED":
            case "DTEINVOICERECEIVED":
                //for these fields display the reason if the new value is invalid
                var errReports = ctrl.fieldContext.sectionContext.gui.errorReports;
                if (errReports && errReports[fieldName]) {
                    XUI.showWarnOk({
                        title: UserContext.tryTranslate("[MOB.VALIDATE_ERR]"),
                        msg: errReports[fieldName].caption
                    });
                }
        }
    };

    this.validateDocument = function (gui) {
        return Object.keys(gui.errorReports).length == 0;
    };

    this.beforeChangingState = function (context) {
        var self = this;

        var isValid = self.validateDocument(context.gui);

        if (isValid) {
            self._autoFillDates(context.gui, context.transition.get("DESTINATIONSTATEID"));
        }

        return false;
    };

    this.getSaveConfirmationMessage = function (gui) {
        var doc = gui.getDocument();
        //check if the user changes a date field and the status related to its date is not respectively evolved
        var inconsistentWarn = UserContext.tryTranslate("[MOBGUIPHARMASTUDY.INCONSISTENT_DATE_AND_STATUS]");
        var inconsistent = false;
        switch (doc.get("IDWFSTATE")) {
            case SalesExecutionNameSpace.StudyWFState.STARTED:
                if (!XApp.isEmptyDate(doc.get("DTEPAPERRETURNED"))) {
                    inconsistentWarn = inconsistentWarn.replace("@", UserContext.tryTranslate("[PHARMASTUDY.DTEPAPERRETURNED]"));
                    inconsistent = true;
                }
                break;
            case SalesExecutionNameSpace.StudyWFState.PAPERRETURNED:
                if (!XApp.isEmptyDate(doc.get("DTEPAPERRECEIVED"))) {
                    inconsistentWarn = inconsistentWarn.replace("@", UserContext.tryTranslate("[PHARMASTUDY.DTEPAPERRECEIVED]"));
                    inconsistent = true;
                }
                break;
            case SalesExecutionNameSpace.StudyWFState.PAPERRECEIVED:
                if (!XApp.isEmptyDate(doc.get("DTEINVOICERECEIVED"))) {
                    inconsistentWarn = inconsistentWarn.replace("@", UserContext.tryTranslate("[PHARMASTUDY.DTEINVOICERECEIVED]"));
                    inconsistent = true;
                }
                break;
        }
        return inconsistent ? inconsistentWarn : this.base.getSaveConfirmationMessage(gui);
    };

    this.afterSaveDocument = function (gui, document, onFailure, onSuccess) {
        //update the navigator
        SalesExecutionEngine.updateNavMobPharmaStudies(document, gui.openData.selectedNavRow, onFailure, onSuccess);
    },

    this.beforeUiRendering = function (context) {
        var gui = context.gui;
        var self = this;
        gui.m_mission = {};
        //render ui only after loading cache data
        context.executeNext = false;
        var startUiGeneration = (function (ui) {
            return function () {
                ui.exe.executeNext();
            };
        })(gui);

        self._loadCacheData(gui, startUiGeneration);
    },

    this._loadCacheData = function (gui, onSuccess) {
        var self = this;
        var f;
        var study = gui.getDocument();

        var localExecutionQueue = new ExecutionQueue();
        var failureCallback = function (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        };
        var successCallback = (function (execQueue) { return function () { execQueue.executeNext(); }; })(localExecutionQueue);

        XUI.showWait();

        //load the mission
        f = (function (gui) {
            return function () {
                self._cacheMission(gui, failureCallback, successCallback);
            };
        })(gui);
        localExecutionQueue.pushHandler(this, f);

        localExecutionQueue.pushHandler(self, function () {
            XUI.hideWait();
            successCallback();
        });
        localExecutionQueue.pushHandler(onSuccess);

        localExecutionQueue.executeNext();
    },


    this._cacheMission = function (gui, onFailure, onSuccess) {
        try {
            var study = gui.getDocument();
            var localExeQueue = new ExecutionQueue();

            var idMission = study.get("IDMISSION");
            if (idMission == null || idMission == "")
                return;

            var loadMission = (function (localExeQueue, idMission, gui) {
                return function () {
                    var missionDocKey = "Mission|" + idMission;
                    XDocs.loadDocument(missionDocKey, false, onFailure,
                        function (docStore) {
                            try {
                                if (docStore && docStore.getCount() > 0) {
                                    gui.m_mission = docStore.getAt(0);
                                }
                            } catch (e) {
                                XLog.logErr("Could not retrive mission from cache, idmission:" + idMission);
                            }
                            localExeQueue.executeNext();
                        });
                };
            })(localExeQueue, idMission, gui);

            localExeQueue.pushHandler(this, loadMission);
            localExeQueue.pushHandler(this, onSuccess);
            localExeQueue.executeNext();

        } catch (e) {
            onFailure(e);
        }
    },

     this.afterNotifyLeave = function (context) {
         var gui = context.ctrl;
         delete gui.m_mission;
     };
};
XApp.registerGuiExtension("mobGuiPharmaStudy", new _mobGuiPharmaStudy());

//#endregion
