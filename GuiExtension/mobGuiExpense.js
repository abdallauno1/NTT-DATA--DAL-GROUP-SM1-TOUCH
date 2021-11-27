//#region _mobGuiExpenseExtension
function _mobGuiExpenseExtension() {

    this.getCustomLayout = function (l, detailContext) {
        try {
            if (!detailContext.originalLayout)
                detailContext.originalLayout = l;

            var layout = Ext.clone(detailContext.originalLayout);
            switch (detailContext.tabName) {
                case "MAIN":
                    switch (detailContext.entityName) {

                        case SFConstants.EXPENSE:
                            var visibleCategories = [];
                            var hasKmExpenseNotes = false;
                            var expenseDays = detailContext.entity.getSubEntityStore(SFConstants.EXPENSEDAY).toArray();

                            if (expenseDays.length > 0) {
                                //total fields will be the same for each day and for the expense itself
                                var ed = expenseDays[0];

                                visibleCategories = this._getVisibleCategories(ed);

                                // check if there are any km expense notes
                                hasKmExpenseNotes = ed.getSubEntityStore(SFConstants.EXPENSENOTES).findBy(function (row) {
                                    return SalesForceEngine.isExpenseOfKmType(row.get("CODEXPENSE"));
                                });

                            } else {
                                // new expense note, without having the period code selected => no expense days loaded
                                // so for getting the available expense categories, we'll look in T154 or in CEXPTYPE qtab
                                var existingNotes = this._getUserDefinedExpenseNotes(detailContext.entity.get("CODUSR"), detailContext.entity.get("CODDIV"));
                                if(existingNotes.length == 0)
                                    existingNotes = UserContext.getDecodeEntriesOrdered('CEXP', true);

                                for (var i = 0; i < existingNotes.length; i++) {
                                    var expCode = (existingNotes[i].cod) ? existingNotes[i].cod : existingNotes[i].get("CODEXPENSE");
                                    var categCode = UserContext.getRefdatValue('CEXP', expCode, 'CEXPTYPE');

                                    if (visibleCategories.indexOf(categCode) < 0) {
                                        visibleCategories.push(categCode);
                                    }

                                    if (SalesForceEngine.isExpenseOfKmType(expCode)) {
                                        hasKmExpenseNotes = true;
                                    }
                                }
                            }

                            //add totals section
                            var totalsSection = this._createTotalsSection(detailContext.gui, visibleCategories, hasKmExpenseNotes, "");
                            if (totalsSection)
                                layout.children.push(totalsSection);

                            break;
                    }

                    break;

                case "ROWS":
                    switch (detailContext.entityName) {

                        case SFConstants.EXPENSEDAY:
                            //add totals section
                            var visibleCategories = this._getVisibleCategories(detailContext.entity);

                            // check if there are any km expense notes
                            var hasKmExpenseNotes = detailContext.entity.getSubEntityStore(SFConstants.EXPENSENOTES).findBy(function (row) {
                                return SalesForceEngine.isExpenseOfKmType(row.get("CODEXPENSE"));
                            });

                            var totalsSection = this._createTotalsSection(detailContext.gui, visibleCategories, hasKmExpenseNotes, "DAY");
                            if (totalsSection)
                                layout.children.push(totalsSection);

                            // for each expense category, add a section with a grid
                            // that will hold the expense notes filtered by the category code
                            for (var i = 0; i < visibleCategories.length; i++) {

                                var gridSection = this._createGridSection(detailContext.gui, detailContext, visibleCategories[i]);
                                layout.children.push(gridSection);
                            }

                            break;
                    }

                    break;
            }

            return layout;
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
            return detailContext.originalLayout;
        }
    };

    this.getQtabsVoices = function (fieldContext) {
        try {
            var entityName = fieldContext.sectionContext.entityName;
            var fieldName = fieldContext.fieldName;

            switch (entityName) {
                case SFConstants.EXPENSE:

                    switch (fieldName) {
                        case "CODSTATUS":
                            //if expense is open then display only statuses 'OPEN' and 'PROPOSED'
                            if (fieldContext.sectionContext.entity.get("CODSTATUS") == SalesForceNameSpace.ExpenseStatus.OPEN) {

                                fieldContext["voices"] = fieldContext["voices"].filter(function (voice) {
                                    return voice.value == SalesForceNameSpace.ExpenseStatus.OPEN || voice.value == SalesForceNameSpace.ExpenseStatus.PROPOSED;
                                });
                            }

                            break;

                        case "CODCUR":
                            fieldContext["voices"] = fieldContext["voices"].filter(function (voice) {
                                return !XApp.isEmptyOrWhitespaceString(voice.value);
                            });

                            break;

                        case "CODPERIOD":
                            if (fieldContext.sectionContext.document.isNew) {
                                switch (ExpenseParameters.getInstance().getExpensePeriod()) {
                                    case "WEEK":
                                        fieldContext["voices"] = this._populateComboPeriodWithWeeks();
                                        break;

                                    case "MONTH":
                                        fieldContext["voices"] = this._populateComboPeriodWithMonths();
                                        break;
                                }
                            }
                            else {
                                //if opening existing document, period is disabled so only load the selected one
                                var expense = fieldContext.sectionContext.document;
                                var periodCode = expense.get("CODPERIOD");
                                fieldContext["voices"] = [{ value: periodCode, text: this._decodeCodPeriod(periodCode, expense) }];
                            }
                            
                            break;
                    }

                    break;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.setNewButtonsStatus = function (context) {
        // user can't add a new expense note
        context.visible = false;
    };

    this.setRemoveButtonsStatus = function (context) {
        // user can't delete an existing expense note
        context.visible = false;
    };

    this.afterNewDocument = function (gui) {
        try {
            var expense = gui.getDocument();
            var loggedUser = CommonEngine.getUserNavRow(UserContext.CodUsr, UserContext.CodDiv, UserContext.CodGrp);
            var codCur = loggedUser.get("CODCUR");

            // if logged user has no currency set, then get the value from T010 parameter
            if (XApp.isEmptyOrWhitespaceString(codCur))
                codCur = UserContext.getConfigParam("CODCUR", "EUR");

            expense.set("IDEXPENSE", "0");
            expense.set("CODSTATUS", SalesForceNameSpace.ExpenseStatus.OPEN);
            expense.set("CODCUR", codCur);

            this._loadCustomData(gui);
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterLoadDocument = function (gui) {
        try {
            var self = this;
            var expense = gui.getDocument();

            this._loadCustomData(gui);

            this._calculateTotals(gui, expense, true);

            if (!this._canEditExpense(expense)) {
                gui.openMode = 'VIEW';
                return;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterNotifyLeave = function (context) {
        delete context.ctrl.m_typologiesDictionary;
    };

    this.afterCardFieldCreation = function (field, context) {
        try {
            var entityName = context.sectionContext.entityName;
            var sectionName = context.sectionContext.config.attrs["caption"];
            var fieldName = context.fieldConfig.attrs["name"];

            switch (entityName) {
                case SFConstants.EXPENSEDAY:

                    switch (sectionName) {
                        case "EXPENSENOTES":
                            // set visibility for fields 'Activity' and 'Notes'
                            switch (fieldName) {
                                case "CODACT":
                                    context.fieldConfig.attrs["visible"] = this._isActivityVisible() ? 'true' : 'false';
                                    break;

                                case "DESNOTE":
                                    context.fieldConfig.attrs["visible"] = this._isNoteVisible() ? 'true' : 'false';
                                    break;
                            }

                            break;
                    }

                    break;
            }

            return field;
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
            return null;
        }
    };

    this.afterSectionCreated = function (context) {
        var entityName = context.detailGui.entityName;
        var sectionType = context.sectionConfig.attrs["type"];

        switch (entityName) {
            case SFConstants.EXPENSEDAY:

                switch (sectionType) {
                    case "GRID":
                        //filter each grid section by expense category
                        context.panel.grid.getStore().setFilters([
                            Ext.create('Ext.util.Filter',
                            {
                                filterFn: function (item) {
                                    return UserContext.getRefdatValue('CEXP', item.get("CODEXPENSE"), 'CEXPTYPE') == context.sectionConfig.attrs["caption"];
                                },
                                root: 'data'
                            })
                        ]);

                        context.panel.grid.setHeight(context.panel.grid.getItemHeight() * (context.panel.grid.getStore().getCount() + 1.5)); // add 2 extra row heights for title and columns header
                        context.panel.grid.refresh();

                        break;
                }
                break;
        }
    };

    this.validateField = function (context) {
            var self = this;
            var entity = context.field.fieldContext.sectionContext.entity;
            var entityName = context.field.fieldContext.sectionContext.entityName;
            var fieldName = context.field.getName();

            switch (entityName) {
                case SFConstants.EXPENSE:

                    switch (fieldName) {
                        case "CODSTATUS":
                            if (context.newVal != SalesForceNameSpace.ExpenseStatus.OPEN) {

                                this._validateExpense(entity,
                                    function (errMsg) {
                                        self._failureCallback(errMsg);
                                        context.newVal = context.oldVal;
                                    });

                            }

                            break;

                        case "CODPERIOD":
                            var expense = context.field.fieldContext.sectionContext.document;
                            if (this._isPeriodUsed(expense, context.newVal)) {

                                XUI.showErrorMsgBox({ msg: UserContext.tryTranslate("[EXPENSE_PERIOD_EXISTS]") });
                                context.newVal = context.oldVal;

                                return;
                            }

                            break;
                    }
                    break;
            }
    };

    this.onEndEditEnded = function (ctrl, fieldName, newVal, oldVal) {
        var context = ctrl.fieldContext.sectionContext;
        var gui = context.gui;

        switch (context.entityName) {
            case SFConstants.EXPENSE:

                switch (ctrl.fieldContext.fieldName) {
                    case "CODSTATUS":

                        if (newVal != SalesForceNameSpace.ExpenseStatus.OPEN) {

                            //if status changed, and it's not 'OPEN' then manually make the columns of the ExpenseDay not editable
                            gui.openMode = "VIEW";

                            if (!gui.tabCtrls["ROWS"])
                                return;

                            var grid = gui.tabCtrls["ROWS"].sections["GRID"].grid;

                            var columns = grid.getColumns();
                            for (var i = 0; i < columns.length; i++) {
                                var column = columns[i];
                                column.editable = false;
                            }

                            grid.updateAllListItems();
                        }

                        break;

                    case "CODPERIOD":
                        if (newVal != oldVal) {
                            // set start and end period dates
                            var periodCode = newVal;
                            var expense = context.entity;
                            var year = parseInt(periodCode.substring(0, 4));
                            var weekMonth = parseInt(periodCode.substring(4));
                            var firstDay, lastDay;

                            switch (ExpenseParameters.getInstance().getExpensePeriod()) {
                                case "WEEK":
                                    firstDay = XApp.firstDayOfWeek(year, weekMonth);
                                    lastDay = XApp.dateAdd(firstDay, 6, "d"); //add 6 days
                                    break;

                                case "MONTH":
                                    //January starts from 0
                                    firstDay = XApp.firstDayOfMonth(year, weekMonth - 1);
                                    lastDay = XApp.lastDayOfMonth(year, weekMonth - 1);
                                    break;
                            }
                           
                            expense.set("DTEFROM", firstDay);
                            expense.set("DTETO", lastDay);

                            //generate expense days
                            this._populateExpenseDays(gui, expense);
                        }

                        break;
                }

                break;
        }
    };

    this.afterCloseHandler = function (context) {
        // when closing the expense day detail, recalculate the totals
        if (context.ctrl.entityName == SFConstants.EXPENSEDAY) {
            if (context.opt.reason == "CANCEL") //if rollback is done, recalculate totals on day
                this._calculateTotalsForDay(context.ctrl.gui, context.ctrl.entity);

            this._calculateTotals(context.ctrl.gui, context.ctrl.entity.getParentEntity());

            //if popup confirmed revalidate rows grid
            if (!context.opt.reason) {
                var rowsTab = context.ctrl.gui.tabCtrls["ROWS"];
                if (rowsTab) {
                    rowsTab.sections.GRID.grid.refresh();
                }
            }

            //refresh totals on MAIN tab
            var mainTab = context.ctrl.gui.tabCtrls["MAIN"];
            if (mainTab) {
                mainTab.refreshControls();
            }
        }
    };

    this.beforeCreateGridColumn = function (fieldContext) {
        try {
            var self = this;
            var entityName = fieldContext.sectionContext.entityName;
            var fieldName = fieldContext.column.fieldName;

            switch (entityName) {
                case SFConstants.EXPENSE:

                    switch (fieldName) {
                        case "CODACT":
                            fieldContext.column.hidden = !this._isActivityVisible() || XApp.isPhone();
                            break;
                        case "DESNOTE":
                            fieldContext.column.hidden = !this._isNoteVisible() || XApp.isPhone();
                            break;
                        case "CODPARTY":
                            //show the customer description and not the code
                            fieldContext.column.renderer = (function (fldContext) {
                                return function (value, values) {
                                    var customer = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(value));
                                    var des = (customer) ? customer.get("DESPARTY1") : value;

                                    return fldContext.column.grid.formatCell("&nbsp;" + des, fldContext.column, value, values);
                                };
                            })(fieldContext);
                            break;
                    }
                    break;

                case SFConstants.EXPENSEDAY:

                    switch (fieldName) {
                        case "QTAEXPENSE":
                            fieldContext.column.minValue = 0;
                            // for quantity flag mode, show a check box instead of a numeric text
                            fieldContext.column.renderer = (function (fldContext) {
                                return function (value, values) {
                                    var str = "";

                                    var expMode = UserContext.getRefdatValue('CEXP', values.CODEXPENSE, 'EXPMODE');
                                    if (expMode == SalesForceNameSpace.ExpenseNotesQtyType.FLAG) {
                                        // show check box
                                        var s;
                                        if (value) {
                                            if (fldContext.column.editable) {
                                                s = 'chk_checked';
                                            } else {
                                                s = 'chk_checked_disabled';
                                            }
                                        } else {
                                            s = 'chk_unchecked';
                                        }
                                        str = '<span class="xgrid-chk ' + s + '" style="text-align:center;" >&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>';
                                    }
                                    else {
                                        // show numeric text
                                        var fs = fldContext.column.formatString || "";
                                        str = (fldContext.column.hideValue && fldContext.column.hideValue == value) ?
                                           '&nbsp;' : UserContext.formatNumber(value, fs);

                                        if (fldContext.column.useSpinners && fldContext.column.editable) {
                                            str = fldContext.column.grid.addSpinnerButtons(str, column);
                                        }
                                    }

                                    return fldContext.column.grid.formatCell(str, fldContext.column, value, values);
                                };
                            })(fieldContext);

                            // for quantity flag mode, center the check box
                            fieldContext.column.validator = (function (fieldContext) {
                                return function (opt) {
                                    var row = opt.rec;

                                    var expMode = UserContext.getRefdatValue('CEXP', row.get("CODEXPENSE"), 'EXPMODE');
                                    if (expMode == SalesForceNameSpace.ExpenseNotesQtyType.FLAG) {
                                        opt.styles.push('text-align:center;');
                                    }
                                };
                            })(fieldContext);

                            break;
                    }
                    break;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.afterCreateGridColumn = function (fieldContext) {
        try {
            var self = this;
            var entityName = fieldContext.sectionContext.entityName;
            var column = fieldContext.fieldName;

            switch (entityName) {
                case SFConstants.EXPENSE:
                    
                    switch (column) {
                        case "DESLOC":
                            fieldContext.column.validator = (function (fieldContext) {
                                return function (context) {
                                    context.column.editable = context.column.editable && 
                                        context.rec.xrec.getParentEntity().get("CODSTATUS") == SalesForceNameSpace.ExpenseStatus.OPEN;
                                    context.isValid = self._isLocationValid(context.rec.xrec);
                                };
                            })(fieldContext);
                            break;
                        case "CODACT":
                            fieldContext.column.validator = (function (fieldContext) {
                                return function (context) {
                                    context.column.editable = context.column.editable &&
                                        context.rec.xrec.getParentEntity().get("CODSTATUS") == SalesForceNameSpace.ExpenseStatus.OPEN;
                                    context.isValid = self._isActivityValid(context.rec.xrec);
                                };
                            })(fieldContext);
                            break;
                        case "DESNOTE":
                            fieldContext.column.validator = (function (fieldContext) {
                                return function (context) {
                                    context.column.editable = context.column.editable &&
                                        context.rec.xrec.getParentEntity().get("CODSTATUS") == SalesForceNameSpace.ExpenseStatus.OPEN;
                                    context.isValid = self._isNoteValid(context.rec.xrec);
                                };
                            })(fieldContext);
                            break;
                    }
                    break;
                case SFConstants.EXPENSEDAY:
                    switch (column) {
                        case "DESNOTE":
                            // ExpenseDesMode : 0 (not editable), 1 (optional), 2 (mandatory)
                            // valid if not mandatory or there is a note
                            fieldContext.column.validator = (function (fieldContext) {
                                return function (context) {
                                    var row = context.rec;
                                    context.isValid = self._isExpenseDescriptionValid(row);
                                };
                            })(fieldContext);
                            break;
                    }
                    break;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.gridBeginEdit = function (context) {
        try {
            var entityName = context.detailContext.entityName;
            var column = context.column.fieldName;

            switch (entityName) {
                case SFConstants.EXPENSEDAY:
                    switch (column) {
                        case "DESNOTE":
                            var expDesc = UserContext.getRefdatValue('CEXP', context.record.xrec.get("CODEXPENSE"), 'EXODESCRIPTION');
                            context.canceled = (expDesc == SalesForceNameSpace.ExpenseNotesDescription.NOTEDITABLE ||
                                                context.record.xrec.get("QTAEXPENSE") == 0);
                            break;

                        case "QTAEXPENSE":
                            if (!this._verifyIfExpenseNoteIsEditable(context.record.xrec)) {
                                context.canceled = true;
                            }

                            var expMode = UserContext.getRefdatValue('CEXP', context.record.get("CODEXPENSE"), 'EXPMODE');
                            if (expMode == SalesForceNameSpace.ExpenseNotesQtyType.FLAG) {
                                context.column.fieldType = "bool";
                            }
                            else {
                                context.column.fieldType = "decimal";
                            }
                            break;
                    }
                    break;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.onGridEndEditEnded = function (context) {
        try {
            var entityName = context.detailContext.entityName;
            var row = context.rowEntity;

            switch (entityName) {
                case SFConstants.EXPENSEDAY:
                    var column = context.fieldName;
                    if (column == "QTAEXPENSE") {
                        var qty = row.get("QTAEXPENSE");

                        //if qty is set to 0 or the flag is unchecked then clear the expense note description
                        if (qty == 0) {
                            row.set("DESNOTE", "");
                        }

                        switch (UserContext.getRefdatValue('CEXP', row.get("CODEXPENSE"), 'EXPMODE')) {
                            case SalesForceNameSpace.ExpenseNotesQtyType.AMOUNT:
                                row.set("TOTAMOUNT", qty);
                                break;
                            case SalesForceNameSpace.ExpenseNotesQtyType.FLAG:
                                row.set("QTAEXPENSE", qty ? -1 : 0);
                                row.set("TOTAMOUNT", qty ? row.get("VALAMOUNT") : 0);
                                break;
                            case SalesForceNameSpace.ExpenseNotesQtyType.QTY:
                                row.set("TOTAMOUNT", qty * row.get("VALAMOUNT"));
                                break;
                        }

                        this._calculateTotalsForDay(context.gui, row.getParentEntity());
                    }

                    var expTypeCode = UserContext.getRefdatValue('CEXP', row.get("CODEXPENSE"), 'CEXPTYPE');
                    if (expTypeCode) {
                        var gridStore = context.detailContext.sections[expTypeCode].grid.getStore();
                        context.detailContext.entity.getSubEntityStore(SFConstants.EXPENSENOTES).rebindSenchaStore(gridStore);
                        context.detailContext.refreshGui();
                    }

                    break;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.setFieldStatus = function (context) {
        try {
            var fieldName = context.field.getName();

            switch (context.gui.entityName) {
                case SFConstants.EXPENSE:

                    switch (fieldName) {
                        case "CODPERIOD":
                            context.valid = !XApp.isEmptyOrWhitespaceString(context.gui.entity.get("CODPERIOD"));
                            break;
                    }
                    break;

                case SFConstants.EXPENSEDAY:
                    var expenseDay = context.gui.entity;

                    switch (fieldName) {
                        case "DESLOC":
                            context.valid = this._isLocationValid(expenseDay);
                            break;
                        case "CODACT":
                            context.valid = this._isActivityValid(expenseDay);
                            break;
                        case "DESNOTE":
                            context.valid = this._isNoteValid(expenseDay);
                            break;
                    }
                    break;
            }
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
        }
    };

    this.validateEntity = function (detailContext) {
        try {
            var self = this;
            var entityName = detailContext.entityName;

            switch (entityName) {
                case SFConstants.EXPENSEDAY:
                    var expenseDay = detailContext.entity;
                    var errMsg = "";

                    //check place
                    if (!self._isLocationValid(expenseDay)) {
                        errMsg += UserContext.tryTranslate("[EXPENSE_DAY_LOC_INCOMPLETE]") + "<br/>" + "<br/>";
                    }

                    //check activity
                    if (!self._isActivityValid(expenseDay)) {
                        errMsg += UserContext.tryTranslate("[EXPENSE_DAY_CAUSE_INCOMPLETE]") + "<br/>" + "<br/>";
                    }

                    //check ExpenseDay notes
                    if (!self._isNoteValid(expenseDay)) {
                        errMsg += UserContext.tryTranslate("[EXPENSE_DAY_DESNOTE_INCOMPLETE]");
                    }

                    if (!XApp.isEmptyOrWhitespaceString(errMsg)) {
                        self._failureCallback(errMsg);
                        return false;
                    }

                    //check expense descriptions that are mandatory and not filled
                    if (!self._validateExpenseDescriptions(expenseDay)) {
                        return false;
                    }    

                    break;
            }

            return true;
        }
        catch (e) {
            XUI.showExceptionMsgBox(e);
            return false;
        }
    };

    this.onSaveDocument = function (gui, document, onSuccess) {
        try {
            var self = this;
            var exeq = gui.exe;

            exeq.pushHandler(self, function () {
                self._validateExpense(document,
                                function (errMsg) {
                                    self._failureCallback(errMsg, exeq);
                                    return false;
                                },
                                function () {
                                    exeq.executeNext();
                                });
            });

            exeq.pushHandler(self, function () {
                if (document.isNew) {
                    self._setExpenseId(document);
                }

                XApp.exec(onSuccess);
            });

            exeq.executeNext();
        }
        catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
            return false;
        }
    };

    //#region Private Methods

    this._loadCustomData = function (gui) {
        // A dictionary used for keeping the track of the typologie (the key) an it's assigned number for managing totals (the value)
        gui.m_typologiesDictionary = [];

        //populate m_typologiesDictionary
        var existingCategories = UserContext.getDecodeEntriesOrdered('CEXPTYPE', true);
        for (var i = 0; i < existingCategories.length; i++) {
            gui.m_typologiesDictionary[existingCategories[i].cod] = i;
        }
    };

    this._canEditExpense = function (expense) {
        var currentDate = new Date();

        return expense.get("CODSTATUS") == SalesForceNameSpace.ExpenseStatus.OPEN &&
            XApp.dateAdd(currentDate, -1 * ExpenseParameters.getInstance().getExpenseExpireInXDays(), "d") < expense.get("DTETO");
    };

    this._setExpenseId = function (expense) {
        var id = SalesForceEngine.getExpenseUniqueID();

        expense.set("IDEXPENSE", id);
        expense.getSubEntityStore(SFConstants.EXPENSEDAY).each(function (expenseDay) {
            expenseDay.set("IDEXPENSE", id);

            expenseDay.getSubEntityStore(SFConstants.EXPENSENOTES).each(function (expenseNote) {
                expenseNote.set("IDEXPENSE", id);
            });
        });
    };

    this._populateComboPeriodWithWeeks = function () {
        var periods = [];

        //get first day of the current week
        var startDate = new Date();
        while (startDate.getDay() != 1)
            startDate.setDate(startDate.getDate() - 1);

        for (var i = 0; i <= ExpenseParameters.getInstance().getExpensePreviousPeriods() ; i++) {
            var endDate = XApp.dateAdd(startDate, 6, "d");

            var periodCode = startDate.getFullYear().toString() + Ext.String.leftPad(startDate.getWeek(), 2, '0');
            periods.push({ value: periodCode, text: this._decodeCodPeriod(periodCode) });

            startDate = XApp.dateAdd(startDate, -7, "d");
        }

        return periods;
    };

    this._populateComboPeriodWithMonths = function () {
        var periods = [];
        var startDate = new Date();

        for (var i = 0; i <= ExpenseParameters.getInstance().getExpensePreviousPeriods() ; i++) {

            var periodCode = startDate.getFullYear() + Ext.String.leftPad((startDate.getMonth() + 1), 2, '0');
            periods.push({ value: periodCode, text: this._decodeCodPeriod(periodCode) });

            startDate.setMonth(startDate.getMonth() - 1);
        }

        return periods;
    };

    // given the period code, return the period description
    this._decodeCodPeriod = function (periodCode, expense) {
        var year = parseInt(periodCode.substring(0, 4));
        var weekMonth = parseInt(periodCode.substring(4));

        switch (ExpenseParameters.getInstance().getExpensePeriod()) {
            case "WEEK":
                var firstWeekDay = expense ? expense.get("DTEFROM") : XApp.firstDayOfWeek(year, weekMonth);
                var lastWeekDay = expense ? expense.get("DTETO") : XApp.dateAdd(firstWeekDay, 6, "d"); //add 6 days

                return  periodCode + " - " +
                        firstWeekDay.toDateString().replace(year + "/", "").replace("/" + year, "")
                        + " - " +
                        lastWeekDay.toDateString().replace(year + "/", "").replace("/" + year, "");

                break;

            case "MONTH":
                return Ext.Date.monthNames[weekMonth - 1] + " " + year;

                break;
        }
    };

    // look for expense notes in T154, defined specifically for the user 
    this._getUserDefinedExpenseNotes = function (codUsr, codDiv) {
        var constraints = new XConstraints({
            logicalOp: "AND",
            constraints: [
                new XConstraint("CODUSR", "=", codUsr),
                new XConstraint("CODDIV", "=", codDiv)
            ]
        });

        if (!XNavHelper.getFromMemoryCache("NAV_MOB_USEREXPENSE"))
            return [];

        return XNavHelper.getNavRecords("NAV_MOB_USEREXPENSE", constraints);
    };

    // returns an array with all expense notes categories existing in the current expense
    this._getVisibleCategories = function (expenseDay) {
        var visibleCategories = [];

        var existingCategories = UserContext.getDecodeEntriesOrdered('CEXPTYPE', true);
        for (var i in existingCategories) {
            var category = existingCategories[i];

            var store = expenseDay.getSubEntityStore(SFConstants.EXPENSENOTES).findBy(function (row) {
                return UserContext.getRefdatValue('CEXP', row.get("CODEXPENSE"), 'CEXPTYPE') == category.cod;
            });

            if (store) {
                visibleCategories.push(category.cod);
            }
        }

        return visibleCategories;
    };

    this._getExpenseQtabDescription = function (qtab, code) {
        return UserContext.getDecodeEntry(qtab, code).des.replace(code, "").replace("()", "").trim();
    };

    this._createTotalsSection = function (gui, visibleCategories, hasKmExpenseNotes, dayString) {
        if (visibleCategories.length == 0)
            return null;

        if (!dayString)
            dayString = "";

        var totalsSection = new Object();

        totalsSection.elementName = "section";
        totalsSection.attrs = new Object();
        totalsSection.attrs.type = "CARD";
        totalsSection.attrs.caption = "TOTALS";
        totalsSection.attrs.labelWidth = "40%";
        totalsSection.attrs.startExpanded = "true";
        totalsSection.children = [];

        var field = null;
        for (var i = 0; i < visibleCategories.length; i++) {
            var associatedCategNb = gui.m_typologiesDictionary[visibleCategories[i]];

            field = this._createField("TOTAL" + dayString + associatedCategNb, this._getExpenseQtabDescription("CEXPTYPE", visibleCategories[i]));
            totalsSection.children.push(field);
        }

        if (hasKmExpenseNotes) {
            field = this._createField("TOTAL" + dayString + "KM");
            totalsSection.children.push(field);
        }

        field = this._createField("TOTAL" + dayString);
        totalsSection.children.push(field);

        return totalsSection;
    };

    this._createField = function (name, caption) {
        var field = new Object();

        field.elementName = "field";
        field.attrs = new Object();
        field.attrs.name = name;
        field.attrs.translation = caption;
        field.attrs.editable = 'false';
        field.children = [];

        return field;
    };

    this._createGridSection = function (gui, context, caption) {
        var gridSection = new Object();
        gridSection.elementName = "section";

        var sectionContext = {
            gui: gui,
            gridSection: gridSection,
            sectionCaption: caption,
            context: context,
            cancel: false
        };

        gui.callCust("beforeCreateGridSection", sectionContext);
        if (sectionContext.cancel) {
            return;
        }
               
        gridSection.attrs = new Object();
        gridSection.attrs.type = "GRID";
        gridSection.attrs.caption = caption;
        gridSection.attrs.startExpanded = "true";
        gridSection.attrs.searchBar = "false";
        gridSection.attrs.detailObject = SFConstants.EXPENSENOTES;
        gridSection.attrs.scrollable = "false";
        gridSection.attrs.useLightSenchaEntity = "true";
        gridSection.children = [];

        var grid = this._createGridElement();
        gridSection.children.push(grid);

        gui.callCust("afterCreateGridSection", sectionContext);

        return gridSection;
    };

    this._createGridElement = function () {
        var grid = new Object();
        grid.elementName = "grid";
        grid.attrs = new Object();
        grid.children = [];

        // add column with name of the expense category
        var column = this._createGridColumn("CODEXPENSE", "28%", 'false');
        grid.children.push(column);

        //  add quantity column
        column = this._createGridColumn("QTAEXPENSE", XApp.isPhone() || XApp.isTablet() ? "20%" : "10%");
        grid.children.push(column);

        //  add expense total column
        column = this._createGridColumn("TOTAMOUNT", XApp.isPhone() || XApp.isTablet() ? "20%" : "12%", 'false');
        grid.children.push(column);

        //  add notes column
        column = this._createGridColumn("DESNOTE", XApp.isPhone() || XApp.isTablet() ? "12%" : "30%");
        grid.children.push(column);

        return grid;
    };

    this._createGridColumn = function (name, width, editable, visible) {
        var column = new Object();
        column.elementName = "column";
        column.attrs = new Object();
        column.attrs.name = name;
        column.attrs.width = width;
        column.attrs.editable = editable ? editable : 'true';
        column.attrs.visible = visible ? visible : 'true';
        column.children = [];
        return column;
    };

    // calculate totals for expense entity
    this._calculateTotals = function (gui, expense, calculateDayTotals) {
        var self = this;
        this._resetTotals(gui, expense);

        //calculate totals
        var existingCategories = UserContext.getDecodeEntriesOrdered('CEXPTYPE', true);
        expense.getSubEntityStore(SFConstants.EXPENSEDAY).each(function (ed) {
            if (calculateDayTotals)
                self._calculateTotalsForDay(gui, ed);

            for (var i in existingCategories) {
                var categCode = existingCategories[i].cod;
                var associatedCategNb = gui.m_typologiesDictionary[categCode];

                expense.set("TOTAL" + associatedCategNb, expense.get("TOTAL" + associatedCategNb) + ed.get("TOTALDAY" + associatedCategNb));
            }

            expense.set("TOTALKM", expense.get("TOTALKM") + ed.get("TOTALDAYKM"));
            expense.set("TOTAL", expense.get("TOTAL") + ed.get("TOTALDAY"));
        });
    };

    // calculate totals on a specific expense day
    this._calculateTotalsForDay = function (gui, expenseDay) {
        this._resetTotals(gui, expenseDay);

        //calculate totals
        expenseDay.getSubEntityStore(SFConstants.EXPENSENOTES).each(function (en) {
            var categCode = UserContext.getRefdatValue('CEXP', en.get("CODEXPENSE"), 'CEXPTYPE');
            var associatedCategNb = gui.m_typologiesDictionary[categCode];

            expenseDay.set("TOTALDAY" + associatedCategNb, expenseDay.get("TOTALDAY" + associatedCategNb) + en.get("TOTAMOUNT"));

            // if Kilometer expense note then add it also to the km total
            if (SalesForceEngine.isExpenseOfKmType(en.get("CODEXPENSE"))) {
                expenseDay.set("TOTALDAYKM", expenseDay.get("TOTALDAYKM") + en.get("TOTAMOUNT"));
            }

            expenseDay.set("TOTALDAY", expenseDay.get("TOTALDAY") + en.get("TOTAMOUNT"));
        });
    };

    // given the period code, return all expense days in that interval
    this._populateExpenseDays = function (gui, expense) {
        try {
            XUI.showWait();

            var expenseDays = [];
            var firstDay = expense.get("DTEFROM");
            var lastDay = expense.get("DTETO");

            while (firstDay <= lastDay) {
                var ed = new XEntity({ entityName: SFConstants.EXPENSEDAY });
                ed.set("DTEEXPENSE", firstDay);

                this._populateExpenseNotes(gui, ed, expense.get("CODUSR"));

                expenseDays.push(ed);

                firstDay = firstDay.addDays(1);
            }

            expense.getSubEntityStore(SFConstants.EXPENSEDAY).clear();
            expense.getSubEntityStore(SFConstants.EXPENSEDAY).addAll(expenseDays);

            this._resetTotals(gui, expense);

            // if tab ROWS is rendered, then reload the new data to the expense days grid
            if (gui.tabCtrls.ROWS) {
                var gridStore = gui.tabCtrls.ROWS.sections.GRID.grid.getStore();
                expense.getSubEntityStore(SFConstants.EXPENSEDAY).rebindSenchaStore(gridStore);
            }

            XUI.hideWait();
        }
        catch (e) {
            XUI.hideWait();
            XUI.showExceptionMsgBox(e);
        }
    };

    this._populateExpenseNotes = function (gui, expenseDay, codUsr) {
        var expenseNotes = [];

        var userDefinedEN = this._getUserDefinedExpenseNotes(codUsr, expenseDay.get("CODDIV"));
        for (var i = 0; i < userDefinedEN.length; i++) {
            expenseNotes.push(this._newExpenseNote(expenseDay.get("DTEEXPENSE"), userDefinedEN[i].get("CODEXPENSE"), i));
        }

        // if no restrictions found for user, then load all expense notes found in the system
        if (expenseNotes.length == 0) {
            
            var expTypes = UserContext.getDecodeEntriesOrdered('CEXP', true);
            for (var i = 0; i < expTypes.length; i++) {
                expenseNotes.push(this._newExpenseNote(expenseDay.get("DTEEXPENSE"), expTypes[i].cod, i));
            }
        }

        expenseDay.getSubEntityStore(SFConstants.EXPENSENOTES).clear();
        expenseDay.getSubEntityStore(SFConstants.EXPENSENOTES).addAll(expenseNotes);

        this._resetTotals(gui, expenseDay);
    };

    // create a new expense note entity, belonging to a specific date
    this._newExpenseNote = function (date, code, progresive) {
        var en = new XEntity({ entityName: SFConstants.EXPENSENOTES });

        en.set("DTEEXPENSE", date);
        en.set("CODEXPENSE", code);
        en.set("PRGROW", progresive);

        var expMode = UserContext.getRefdatValue('CEXP', code, 'EXPMODE');
        if (expMode == SalesForceNameSpace.ExpenseNotesQtyType.FLAG || expMode == SalesForceNameSpace.ExpenseNotesQtyType.QTY) {
            var exp = UserContext.getDecodeEntry('CEXP', code);
            en.set("VALAMOUNT", exp.numOptional);
        }

        return en;
    };

    // set all total to 0
    this._resetTotals = function (gui, entity) {
        var dayString = "";
        if (entity.getEntityName() == SFConstants.EXPENSEDAY)
            dayString = "DAY";

        var existingCategories = UserContext.getDecodeEntriesOrdered('CEXPTYPE', true);
        for (var i in gui.m_typologiesDictionary) {
            entity.set("TOTAL" + dayString + gui.m_typologiesDictionary[i], 0.0);
        }

        entity.set("TOTAL" + dayString + "KM", 0.0);
        entity.set("TOTAL" + dayString, 0.0);
    };

    this._isNoteVisible = function () {
        return ExpenseParameters.getInstance().getExpenseDesnoteCodact().charAt(0) != "0";
    };

    this._isNoteMandatory = function () {
        return ExpenseParameters.getInstance().getExpenseDesnoteCodact().charAt(1) != "0";
    };

    this._isActivityVisible = function () {
        return ExpenseParameters.getInstance().getExpenseDesnoteCodact().charAt(2) != "0";
    };

    this._isActivityMandatory = function () {
        return ExpenseParameters.getInstance().getExpenseDesnoteCodact().charAt(3) != "0";
    };

    this._hasTotals = function (expenseDay) {
        return expenseDay.get("TOTALDAY") > 0;
    };

    this._isLocationValid = function (expenseDay) {
        return !this._hasTotals(expenseDay) || !XApp.isEmptyOrWhitespaceString(expenseDay.get("DESLOC"));
    };

    this._isActivityValid = function (expenseDay) {
        return !this._isActivityVisible() ||
                !this._isActivityMandatory() ||
                !this._hasTotals(expenseDay) ||
                !XApp.isEmptyOrWhitespaceString(expenseDay.get("CODACT"));
    };

    this._isNoteValid = function (expenseDay) {
        return !this._isNoteVisible() ||
            !this._isNoteMandatory() ||
            !this._hasTotals(expenseDay) ||
            !XApp.isEmptyOrWhitespaceString(expenseDay.get("DESNOTE"));
    };

    this._isExpenseDescriptionValid = function (expenseNote) {
        var expDesc = UserContext.getRefdatValue('CEXP', expenseNote.get("CODEXPENSE"), 'EXODESCRIPTION');

        return expDesc != SalesForceNameSpace.ExpenseNotesDescription.MANDATORY ||
            !XApp.isEmptyOrWhitespaceString(expenseNote.get("DESNOTE")) ||
            expenseNote.get("QTAEXPENSE") == 0;
    };

    //check if period used in another expense of the same user
    this._isPeriodUsed = function (expense, codPeriod) {       
        var constraints = new XConstraints({
            logicalOp: "AND",
            constraints: [
                new XConstraint("CODUSR", "=", expense.get("CODUSR")),
                new XConstraint("CODDIV", "=", expense.get("CODDIV")),
                new XConstraint("CODPERIOD", "=", codPeriod)
            ]
        });

        var similarExpense = XNavHelper.getNavRecords("NAV_MOB_EXPENSES", constraints);

        return similarExpense.length > 0;
    };

    // verify is expense note is editable.
    this._verifyIfExpenseNoteIsEditable = function (expenseNote) {
        var alternativeCode = UserContext.getRefdatValue('CEXP', expenseNote.get("CODEXPENSE"), 'EXPALTERNATIVE');
        if(XApp.isEmptyOrWhitespaceString(alternativeCode))
            return true;

        var expenseNotes = expenseNote.getParentEntity().getSubEntityStore(SFConstants.EXPENSENOTES);
        //if one of the expenses for the current day and current category have QTAEXPENSE != 0, don't allow user to modify value of expense
        var similarNote = expenseNotes.findBy(function (row) {
            return row.get("CODEXPENSE") != expenseNote.get("CODEXPENSE")
                && UserContext.getRefdatValue('CEXP', row.get("CODEXPENSE"), 'EXPALTERNATIVE') == alternativeCode
                && row.get("QTAEXPENSE") != 0
        });

        if (similarNote) {
            XUI.showErrorMsgBox({
                msg: UserContext.tryTranslate("[CANNOT_EDIT_EXPENSE]") + " " + this._getExpenseQtabDescription("CEXP", expenseNote.get("CODEXPENSE"))
                    + "</br>" +
                    UserContext.tryTranslate("[BECAUSE_OF_EXPENSE]") + " " + this._getExpenseQtabDescription("CEXP", similarNote.get("CODEXPENSE"))
            });

            return false;
        }

        return true;
    };

    // 'Place' field is mandatory if in the current day TOTALDAY or TOTALKM is > 0
    this._validateLocations = function (expense, onFail, onSuccess) {
        var self = this;
        var isValid = true;
        var errMsg = UserContext.tryTranslate("[EXPENSE_DAY_LOC_INCOMPLETE]");

        expense.getSubEntityStore(SFConstants.EXPENSEDAY).each(function (ed) {
            if (!self._isLocationValid(ed)) {
                isValid = false;
                return false;
            }
        });

        if (!isValid && onFail)
            onFail(errMsg);

        if (isValid && onSuccess)
            onSuccess();
    };

    // validate 'Activity' field depending on the 'EXPENSE_DESNOTE_CODACT' parameter
    // if it should be visible/hidden and optional/mandatory
    this._validateActivities = function (expense, onFail, onSuccess) {
        var self = this;
        var isValid = true;
        var errMsg = UserContext.tryTranslate("[EXPENSE_DAY_CAUSE_INCOMPLETE]");

        expense.getSubEntityStore(SFConstants.EXPENSEDAY).each(function (ed) {
            if (!self._isActivityValid(ed)) {
                isValid = false;
                return false;
            }
        });

        if (!isValid && onFail)
            onFail(errMsg);

        if (isValid && onSuccess)
            onSuccess();
    };

    // validate 'Notes' field depending on the 'EXPENSE_DESNOTE_CODACT' parameter
    // if it should be visible/hidden and optional/mandatory
    this._validateNotes = function (expense, onFail, onSuccess) {
        var self = this;
        var isValid = true;
        var errMsg = UserContext.tryTranslate("[EXPENSE_DAY_DESNOTE_INCOMPLETE]");

        expense.getSubEntityStore(SFConstants.EXPENSEDAY).each(function (ed) {
            if (!self._isNoteValid(ed)) {
                isValid = false;
                return false;
            }
        });

        if (!isValid && onFail)
            onFail(errMsg);

        if (isValid && onSuccess)
            onSuccess();
    };

    this._validateExpenseDescriptions = function (expenseDay) {
        var self = this;
        var isValid = true;

        expenseDay.getSubEntityStore(SFConstants.EXPENSENOTES).each(function (row) {
            if (!self._isExpenseDescriptionValid(row)) {
                isValid = false;
                return false;
            }
        });

        if (!isValid) {
            return false;
        }

        return true;
    };

    // validate document
    this._validateExpense = function (expense, onFail, onSuccess) {
        var self = this;
        var msg = "";

        //validate period code
        if (XApp.isEmptyOrWhitespaceString(expense.get("CODPERIOD"))) {
            msg += UserContext.tryTranslate("[EXPENSE_PERIOD_ERROR]") + "<br/>" + "<br/>";
        }

        // validate Place fields
        this._validateLocations(expense,
            function (errMsg) {
                msg += errMsg + "<br/>" + "<br/>";
            });

        // validate Activity fields
        this._validateActivities(expense,
            function (errMsg) {
                msg += errMsg + "<br/>" + "<br/>";
            });

        // validate Notes fields
        this._validateNotes(expense,
            function (errMsg) {
                msg += errMsg ;
            });

        if (!XApp.isEmptyOrWhitespaceString(msg)) {
            onFail(msg);
        }
        else if (onSuccess) {
            onSuccess();
        }
    };

    this._failureCallback = function (message, exeq) {
        if (exeq)
            exeq.clear();

        XUI.hideWait();
        XUI.showErrorMsgBox(message);
    };

    //#endregion
}
XApp.registerGuiExtension("mobGuiExpense", new _mobGuiExpenseExtension());
//#endregion
