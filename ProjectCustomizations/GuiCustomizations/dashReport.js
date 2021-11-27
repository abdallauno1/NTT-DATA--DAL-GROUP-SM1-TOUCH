//********************************************************************************************************************
//********************************************** ENHACEMENT 34412 ****************************************************
//********************************************************************************************************************

var XDASHREPORT = function () {
    this.rootPanel = null;
    this.tabPanel = null;
    this.dashReportName = "";
    this.chartPanels = {};
    this.stores = {};
    this.t010UmTo = "";     // PARAMETER USED TO CONVERT QTY

    this.customers = [];    //Customer Navigator Array
    this.orders = [];       //Order Navigator Array
    this.prod = [];         //Product Navigator Array
    this.visits = [];       //Visit Navigator Array
    this.objectivesTable = [];  //Objective Navigator Array

    this.orderRows = [];        //Order Rows Array 
    this.encashmentRows = [];   //Encashment Rows Array 
    this.objectiveRows = [];    //Objective Rows Array 
    this.visitRows = [];        //Visit Rows Array 

    this.custOrd = [];          //Customers who ordered
    this.prodOrd = [];          //Ordered Products
    this.visitedCustomer = [];  //Visited Customer

    this.OrowNum = 0;       //Order Rows Index
    this.ErowNum = 0;       //Encashment Rows Index
    this.OBJrowNum = 0;     //Objective Index

    this.gaugesConfig = [];     //Gauge Config Array

    this.NegativeCalls = 0;
    this.colorReport3Visited = "";     //variable used to color VISITED_VS_TARGET inside Report 3
    this.colorReport3Positive = "";     //variable used to color POSITIVE_CALL_PERC inside Report 3

    /*
        createGaugesConfig: fill this.gaugesConfig with Gauges configuration
        this.gaugesConfig structure:
            [0]: Gauge Name - [1]: Range/Color Definition - [2]: Minimum value - [3]: Maximum value - [4]: Value - [5]: Target [used in the second Toolbar] - [6]: Amount [used in the second Toolbar]
    */

    this.createGaugesConfig = function () {
        var self = this;
        var constr;
        var convCache;
        //  ****************************************  GAUGE 11  ****************************************
        var trad = UserContext.tryTranslate("[XDASHREPORT.OBJECTIVE_NOT_FOUND]");
        var amount;
        var obj;
        var target = trad;
        for (var i = 0; i < self.objectiveRows.length; i++) {
            if (self.objectiveRows[i].CODOBJMEASURE == UserContext.getConfigParam("TOUCH_DASHREPORT_OBJ_AVG_ORDER_ROW", "")) {
                obj = self.objectiveRows[i].ObjectiveRowDetails;
                break;
            }
        }
        if (obj) {
            for (var i = 0; i < obj.length; i++) {
                if (obj[i].VALATTRIBUTE1 == UserContext.CodUsr) {
                    target = parseFloat(obj[i].VALMEASURE);
                    break;
                }
            }
        }
        var max = 120;
        var count = 0;
        var countOrd = 0;
        var value = 0;
        if (target != trad) {
            for (var iOrd = 0, lOrd = self.orders.length; iOrd < lOrd; iOrd++) {
                if ((self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)
                        && UserContext.getRefdatValue("CTORD", self.orders[iOrd].get("CODTYPORD"), "MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES) {
                    countOrd++;
                }
                for (var iOrdRow = 0, lOrdRow = self.orderRows.length; iOrdRow < lOrdRow; iOrdRow++) {
                    for (var i = 0, l = self.orderRows[iOrdRow]._entities.length; i < l; i++) {
                        if (self.orderRows[iOrdRow]._entities[i].get("NUMORD") == self.orders[iOrd].get("NUMORD") && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)
                                && UserContext.getRefdatValue("CTORD", self.orders[iOrd].get("CODTYPORD"), "MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES) {
                            if ((self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.ANNULLATA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.SOSPESA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA)) {
                                count++;
                            }
                        }
                    }
                }
            }
            if (countOrd == 0) {
                value = 0;
            } else {
                value = ((count / countOrd) / target) * 100;
            }
            value = UserContext.formatNumber(value, "#,###.##");
            if (value > max) {
                max = value;
            }
            max = parseInt(max);
            target = UserContext.formatNumber(target, "#,###.##");
        }
        if (countOrd == 0) {
            amount = UserContext.formatNumber(0, "#,###.##");
        } else {
            amount = UserContext.formatNumber(count / countOrd, "#,###.##");
        }

        self.gaugesConfig.push(new Array('Gauge11', '100,R,' + max + ',G', '0', max, value, target, amount));

        //  ****************************************  GAUGE 12  ****************************************
        target = trad;
        for (var i = 0; i < self.objectiveRows.length; i++) {
            if (self.objectiveRows[i].CODOBJMEASURE == UserContext.getConfigParam("TOUCH_DASHREPORT_OBJ_PERISH_PERC", "")) {
                obj = self.objectiveRows[i].ObjectiveRowDetails;
                break;
            }
        }
        if (obj) {
            for (var i = 0; i < obj.length; i++) {
                if (obj[i].VALATTRIBUTE1 == UserContext.CodUsr) {
                    target = parseFloat(obj[i].VALMEASURE);
                    break;
                }
            }
        }
        value = 0;
        max = 120;
        var salesQty = 0;
        var perishQty = 0;
        if (target != trad) {
            for (var iOrd = 0, lOrd = self.orders.length; iOrd < lOrd; iOrd++) {
                for (var iOrdRow = 0, lOrdRow = self.orderRows.length; iOrdRow < lOrdRow; iOrdRow++) {
                    for (var i = 0, l = self.orderRows[iOrdRow]._entities.length; i < l; i++) {
                        if (self.orderRows[iOrdRow]._entities[i].get("NUMORD") == self.orders[iOrd].get("NUMORD") && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)) {
                            if ((self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.ANNULLATA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.SOSPESA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA)) {
                                if (self.orderRows[iOrdRow]._entities[i].get("CODTYPROW") == SalesForceNameSpace.OrderCTORD.SALES) {
                                    if (self.t010UmTo == "") {
                                        salesQty = salesQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                    } else {
                                        constr = new XConstraints({
                                            logicalOp: 'AND',
                                            constraints: [
                                                { attr: 'UMTO', op: '=', value: self.t010UmTo },
                                                { attr: 'UMFROM', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("UMORD") },
                                                { attr: 'CODART', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("CODART") },
                                                { attr: 'CODDIV', op: '=', value: UserContext.CodDiv }
                                            ]
                                        });
                                        convCache = XNavHelper.getFromMemoryCache("NAV_MOB_PRODUMCONV").filterByConstraints(constr);
                                        if (convCache[0]) {
                                            salesQty = salesQty + parseInt((self.orderRows[iOrdRow]._entities[i].get("QTYORD")) * parseFloat(convCache[0].get("VALCONVFACT")));
                                        } else {
                                            salesQty = salesQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                        }
                                    }
                                } else if (self.orderRows[iOrdRow]._entities[i].get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.PERISH) {
                                    if (self.t010UmTo == "") {
                                        perishQty = perishQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                    } else {
                                        constr = new XConstraints({
                                            logicalOp: 'AND',
                                            constraints: [
                                                { attr: 'UMTO', op: '=', value: self.t010UmTo },
                                                { attr: 'UMFROM', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("UMORD") },
                                                { attr: 'CODART', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("CODART") },
                                                { attr: 'CODDIV', op: '=', value: UserContext.CodDiv }
                                            ]
                                        });
                                        convCache = XNavHelper.getFromMemoryCache("NAV_MOB_PRODUMCONV").filterByConstraints(constr);
                                        if (convCache[0]) {
                                            perishQty = perishQty + parseInt((self.orderRows[iOrdRow]._entities[i].get("QTYORD")) * parseFloat(convCache[0].get("VALCONVFACT")));
                                        } else {
                                            perishQty = perishQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (salesQty != 0) {
                value = parseInt((((perishQty / salesQty) * 100) / target) * 100);
            } else {
                value = 0;
            }
            if (value > max) {
                max = value;
            }
            max = parseInt(max);
            target = UserContext.formatNumber(target, "#,###.##");
        }
        if (salesQty == 0) {
            amount = UserContext.formatNumber(0, "#,###.##");
        } else {
            amount = UserContext.formatNumber((perishQty / salesQty) * 100, "#,###.##");
        }

        self.gaugesConfig.push(new Array('Gauge12', '100,G,' + max + ',R', '0', max, value, target, amount));

        //  ****************************************  GAUGE 21  ****************************************
        target = trad;
        for (var i = 0; i < self.objectiveRows.length; i++) {
            if (self.objectiveRows[i].CODOBJMEASURE == UserContext.getConfigParam("TOUCH_DASHREPORT_OBJ_TOTAL_AMOUNT", "")) {
                obj = self.objectiveRows[i].ObjectiveRowDetails;
                break;
            }
        }
        if (obj) {
            for (var i = 0; i < obj.length; i++) {
                if (obj[i].VALATTRIBUTE1 == UserContext.CodUsr) {
                    target = parseFloat(obj[i].VALMEASURE);
                    break;
                }
            }
        }
        max = 120;
        value = 0;
        var sum = 0;
        var qty = 0;
        if (target != trad) {
            for (var iOrd = 0, lOrd = self.orders.length; iOrd < lOrd; iOrd++) {
                for (var iOrdRow = 0, lOrdRow = self.orderRows.length; iOrdRow < lOrdRow; iOrdRow++) {
                    for (var i = 0, l = self.orderRows[iOrdRow]._entities.length; i < l; i++) {
                        if (self.orderRows[iOrdRow]._entities[i].get("NUMORD") == self.orders[iOrd].get("NUMORD") && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO) && UserContext.getRefdatValue("CTORD", self.orders[iOrd].get("CODTYPORD"), "MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES) {
                            if ((self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.ANNULLATA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.SOSPESA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA)) {
                                sum = sum + self.orderRows[iOrdRow]._entities[i].get("NETAMOUNT") + self.orderRows[iOrdRow]._entities[i].get("TAXAMOUNT");
                                if (self.t010UmTo == "") {
                                    qty = qty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                } else {
                                    constr = new XConstraints({
                                        logicalOp: 'AND',
                                        constraints: [
                                            { attr: 'UMTO', op: '=', value: self.t010UmTo },
                                            { attr: 'UMFROM', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("UMORD") },
                                            { attr: 'CODART', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("CODART") },
                                            { attr: 'CODDIV', op: '=', value: UserContext.CodDiv }
                                        ]
                                    });
                                    convCache = XNavHelper.getFromMemoryCache("NAV_MOB_PRODUMCONV").filterByConstraints(constr);
                                    if (convCache[0]) {
                                        qty = qty + parseInt((self.orderRows[iOrdRow]._entities[i].get("QTYORD")) * parseFloat(convCache[0].get("VALCONVFACT")));
                                    } else {
                                        qty = qty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (sum != 0) {
                value = parseInt((sum / target) * 100);
            } else {
                value = 0;
            }
            if (value > max) {
                max = value;
            }
            max = parseInt(max);
            target = UserContext.formatNumber(target, "#,###.##");
        }
        if (sum == 0) {
            amount = UserContext.formatNumber(0, "#,###.##");
        } else {
            amount = UserContext.formatNumber(sum, "#,###.##");

        }
        self.gaugesConfig.push(new Array('Gauge21', '100,R,' + max + ',G', '0', max, value, target, UserContext.formatNumber(sum, "#,###.##")));

        //  ****************************************  GAUGE 22  ****************************************
        target = trad;
        for (var i = 0; i < self.objectiveRows.length; i++) {
            if (self.objectiveRows[i].CODOBJMEASURE == UserContext.getConfigParam("TOUCH_DASHREPORT_OBJ_CASES", "")) {
                obj = self.objectiveRows[i].ObjectiveRowDetails;
                break;
            }
        }
        if (obj) {
            for (var i = 0; i < obj.length; i++) {
                if (obj[i].VALATTRIBUTE1 == UserContext.CodUsr) {
                    target = parseFloat(obj[i].VALMEASURE);
                    break;
                }
            }
        }

        max = 120;
        if (target != trad) {
            if (qty != 0) {
                value = parseInt((qty / target) * 100);
            } else {
                value = 0;
            }
            if (value > max) {
                max = value;
            }
            max = parseInt(max);
            target = UserContext.formatNumber(target, "#,###.##");
        }
        if (qty == 0) {
            amount = UserContext.formatNumber(0, "#,###.##");
        } else {
            amount = UserContext.formatNumber(qty, "#,###.##");
        }

        self.gaugesConfig.push(new Array('Gauge22', '100,R,' + max + ',G', '0', max, value, target, UserContext.formatNumber(qty, "#,###.##")));
    };

    //#region setData

    /*
        Different from dash2.js
        It takes data from this.gaugesConfig Array
    */

    this._setGaugeData = function (name, chartPanel) {
        var self = this;
        if (chartPanel.gauge == undefined)
            return;
        var config = null;
        for (var i = 0; i < self.gaugesConfig.length; i++) {
            if (self.gaugesConfig[i][0] == name) {
                config = self.gaugesConfig[i];
                break;
            }
        }

        var ranges = config[1];
        var bands = [];
        var min = parseInt(config[2]);
        var max = parseInt(config[3]);
        var value = parseInt(config[4]);

        if (ranges != "") {
            var v = ranges.split(",");
            var from = min;
            for (var i = 0; i < v.length; i += 2) {
                var n = v[i];
                var color = v[i + 1];
                if (color == "") {
                    from = n;
                    continue;
                }
                switch (color) {
                    case "R":
                        color = "#a61120";
                        break;
                    case "G":
                        color = "#94ae0a";
                        break;
                    case "Y":
                        color = "#ffd13e";
                        break;
                }
                bands.push({
                    color: color,
                    from: from,
                    to: n
                });
                from = n;
            }
        }

        var w = null;
        var h = null;
        var size = w;
        if (w > h) {
            size = h;
        }
        size -= 20;


        var numMajorTicks = 4;
        if (numMajorTicks == "")
            numMajorTicks = 2;

        var numMinorTicks = 4;
        if (numMinorTicks == "")
            numMinorTicks = 5;


        var majorTicks = [];
        var step = (max - min) / numMajorTicks;
        for (var v = min; v <= max; v += step) {
            var s = UserContext.formatNumber(v, "###.##");
            s = s.replace(".00", "");
            s = s.replace(".0", "");
            majorTicks.push(s);
        }

        var options = {
            renderTo: chartPanel.cnv,
            width: chartPanel.cnv.clientWidth,
            height: chartPanel.cnv.clientHeight,
            title: false,
            minValue: min,
            maxValue: max,
            majorTicks: majorTicks,
            minorTicks: numMinorTicks, // small ticks inside each major tick
            strokeTicks: true,
            units: false,
            valueFormat: { int: 1 },
            glow: true,
            animation: false,
            highlights: bands
        };

        var gauge = new Gauge(options);
        chartPanel.gauge = gauge;
        gauge.draw();
        gauge.setValue(value);
    };

    //#endregion

    this.handleOrientationChange = function (viewport, orientation, width, height, opt) {

        console.log('rpc.view.home.indexView ~ handleOrientationChange');

        var self = this;
        if (self.refreshFlag)
            return;

        // Execute the code that needs to fire on Orientation Change.
        //alert('o:' + orientation + ' w:' + width + ' h:' + height);
        if (orientation != self._lastOrientation) {
            self._lastOrientation = orientation;
            console.log('Changing orientation to => ' + orientation);
            self.draw();
            return;
        }
        for (var k in self._gauges) {
            var opt = self._gauges[k];
            var w = opt.pnl.element.dom.clientWidth;
            var h = opt.pnl.element.dom.clientHeight;
            opt.cnv.width = w;
            opt.cnv.height = h;

            self._setGaugeData(opt.name, opt.chartPanel);
        }
        for (var k in self._qliks) {
            var opt = self._qliks[k];
            var w = opt.pnl.element.dom.clientWidth;
            var h = opt.pnl.element.dom.clientHeight;
            alert(w + " " + h);
            opt.ifr.width = w;
            opt.ifr.height = h;


        }
    };

    this.show = function (options) {
        XUI.showWait();
        var self = this;
        self.stores = {};
        try {
            self.colors = ["#115fa6", "#94ae0a", "#a61120", "#ff8809", "#ffd13e", "#a61187", "#24ad9a", "#7c7474", "#a66111"];
            var t010Colors = UserContext.getConfigParam("TOUCH_DASH_COLORS", "");
            if (t010Colors != "") {
                self.colors = [];
                var colors = t010Colors.split(',');
                for (var i = 0; i < colors.length; i++) {
                    var c = colors[i];
                    c = c.trim();
                    if (c == "")
                        continue;
                    self.colors.push(c);
                }
            }
            if (options.colors)
                self.colors = options.colors;
            self.panel = options.panel;
            if (self.panel)
                //close the dash when destroying the parent panel
                options.panel.on({
                    destroy: function () {
                        self.doClose();
                    }
                });
            self.initVars = options.initVars;
            if (!self.initVars && options.filters)
                self.initVars = options.filters;
            if (self.initVars == undefined)
                self.initVars = {};
            self.showNavigationButtons = (options.showNavigationButtons != undefined && options.showNavigationButtons != null) ? options.showNavigationButtons : true;

            self.dashReportName = "XDASHREPORT";
            self.orders = [];
            self.encashmentRows = [];
            self.orderRows = [];
            self.orderRowsTest = [];
            self.visitRows = [];
            self.objectiveRows = [];

            self.getData();

        } catch (ex) {
            XUI.showExceptionMsgBox(ex);
            XUI.hideWait();
        }
    };

    //Create and show the Main Panel

    this.showform = function () {
        var self = this;
        try {                        
            self.form = new Ext.Panel({
                fullscreen: true,
                cls: 'sm1-gui sm1-appsettings',
                ui: 'dark',
                title: 'aaaa',
                layout: {
                    type: 'card',
                    align: 'stretch'
                },
                items: [
                        {
                            xtype: 'toolbar',
                            title: UserContext.tryTranslate("[XDASHREPORT." + self.dashReportName + "]"),
                            cls: 'sm1-toolbar',
                            docked: 'top',
                            items: self.showNavigationButtons ? [
                                
                                /*XUI.createHomeButton({
                                    handler: function () {
                                        XHistory.toggleMenu();
                                    }
                                }),*/
                                {
                                    xtype: 'spacer',
                                    cls: 'sm1-spacer'
                                },
                                /*XHistory.hasBack() ? {
                                    cls: 'sm1-toolbar-button-back',
                                    handler: function () {
                                        self.doBack();
                                    }
                                } : {}*/
                            ] : []
                        },
                        {
                            xtype: 'tabpanel',
                            cls: 'sm1-tabbar x-panel sm1-dash-frame',
                            title: 'aaaa',
                            id: 'mainTabPanel',
                            tabBar: {
                                id: 'tabBar',
                                scrollable: 'horizontal'
                            },
                            items: [
                                self.createReport1(),
                                self.createReport21(),
                                self.createReport22(),
                                self.createReport3(),
                                self.createReport4(),
                                self.createReport5(),
                                self.createReport6()
                            ]

                        },
                        {
                            xtype: 'toolbar',
                            docked: 'bottom',
                            cls: 'sm1-toolbar-popup',
                            items: [
                                {
                                    xtype: 'xbutton',
                                    cls: 'sm1-bt sm1-bt-prev',
                                    docked: 'left',
                                    /*onPress: function () {
                                        try {
                                            if (parseInt(Ext.getCmp('mainTabPanel').getActiveItem().getId()) > 0) {
                                                Ext.getCmp('mainTabPanel').setActiveItem(parseInt(Ext.getCmp('mainTabPanel').getActiveItem().getId()) - 2);
                                            }
                                        } catch (e) {
                                            XUI.showExceptionMsgBox(e);
                                        }
                                    }*/
                                },
                                {
                                    xtype: 'spacer',
                                    cls: 'sm1-spacer'
                                },
                                {
                                    cls: 'sm1-bt sm1-bt-next',
                                    docked: 'right',
                                    xtype: 'xbutton'
                                    /*onPress: function () {
                                        try {
                                            Ext.getCmp('mainTabPanel').setActiveItem(parseInt(Ext.getCmp('mainTabPanel').getActiveItem().getId()));
                                        } catch (e) {
                                            XUI.showExceptionMsgBox(e);
                                        }
                                    }*/
                                }
                            ]
                        }

                ]
            });

            // Add Swipe to all Panel inside TabPanel
            for (var i = 0; i < Ext.getCmp('mainTabPanel').innerItems.length; i++) {
                self.swipe(Ext.getCmp('mainTabPanel').innerItems[i].id);
            }

            // Change style of Report 6 - Collection Details
            if (UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVIGATE") || UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVDATA")) {
                Ext.getCmp('MyTextField').label.dom.firstChild.style.fontSize = '20px';
                Ext.getCmp('MyTextField').label.dom.firstChild.style.webkitTextFillColor = '#005798';

                Ext.getCmp('MyTextField').bodyElement.dom.firstChild.firstChild.style.fontSize = '20px';
                Ext.getCmp('MyTextField').bodyElement.dom.firstChild.firstChild.style.cssText = Ext.getCmp('MyTextField').bodyElement.dom.firstChild.firstChild.style.cssText + '-webkit-text-fill-color: #005798 !important;';
            } else {
                Ext.getCmp('mainTabPanel').getTabBar().getComponent(6).hide();
            }

            // Change color of VISITED_VS_TARGET in Report 3
            Ext.getCmp('targetVisited').bodyElement.dom.firstChild.firstChild.style.cssText = Ext.getCmp('targetVisited').bodyElement.dom.firstChild.firstChild.style.cssText + '-webkit-text-fill-color: ' + this.colorReport3Visited + ' !important;';
            Ext.getCmp('targetPositive').bodyElement.dom.firstChild.firstChild.style.cssText = Ext.getCmp('targetPositive').bodyElement.dom.firstChild.firstChild.style.cssText + '-webkit-text-fill-color: ' + this.colorReport3Positive + ' !important;';

            app.viewport.removeAll(true, true);
            app.viewport.add(self.form);
            self.form.show();

        } catch (ex) {
            XUI.showExceptionMsgBox(ex);
            XUI.hideWait();
            self.doBack();
        }
    };

    // Add swipe to a Panel

    this.swipe = function (id) {
        Ext.getCmp(id).element.on({
            swipe: (function () {
                return function (event) {
                    try {
                        if (event.direction != 'left' && event.direction != 'right')
                            return;
                        if (event.direction == 'right') {
                            if (parseInt(Ext.getCmp('mainTabPanel').getActiveItem().getId()) > 0) {
                                Ext.getCmp('mainTabPanel').setActiveItem(parseInt(Ext.getCmp('mainTabPanel').getActiveItem().getId()) - 2);
                            }
                        } else {
                            Ext.getCmp('mainTabPanel').setActiveItem(parseInt(Ext.getCmp('mainTabPanel').getActiveItem().getId()));
                        }
                    } catch (e) {
                        XUI.showExceptionMsgBox(e);
                    }
                };
            })()
        });
    };

    // get Data from Memory Cache

    this.getData = function () {
        var self = this;

        self.gaugesConfig = [];
        self.loadQueue = new ExecutionQueue();
        self.t010UmTo = UserContext.getConfigParam("TOUCH_DASHREPORT_UMTO", "");

        self.customers = XNavHelper.getFromMemoryCache("NAV_MOB_CUST");
        self.visits = XNavHelper.getNavRecords("NAV_MOB_VISITS", new XConstraint("DTEVISIT", "=", new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toString()));

        var constraints = new XConstraints({
            logicalOp: 'AND',
            constraints: [
                { attr: 'DTESTART', op: '<=', value: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toString() },
                { attr: 'DTEEND', op: '>=', value: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toString() }
            ]
        });
        self.objectivesTable = XNavHelper.getNavRecords("NAV_MOB_OBJECTIVES", constraints);

        constraints = new XConstraints({
            logicalOp: 'AND',
            constraints: [
                { attr: 'DTEVISIT', op: '=', value: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toString() },
                { attr: 'CODSTATUS', op: '=', value: SalesExecutionNameSpace.SurveyStatus.COMPLETED }
            ]
        });
        self.visitedCustomer = XNavHelper.getNavRecords("NAV_MOB_VISITS", constraints);

        self.prod = XNavHelper.getFromMemoryCache("NAV_MOB_PROD");
        self.orders = XNavHelper.getNavRecords("NAV_MOB_ORDERS", new XConstraint("DTEORD", "=", new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toString()));

        self.getOrderRow();
        self.getCustomerVisit();
        self.getOBJRow();
        self.getEncashmentRows();

        self.loadQueue.pushHandler(self, function () {
            self.OrowNum = 0;
            self.ErowNum = 0;
            self.OBJrowNum = 0;
            self.CVrowNum = 0;
            self.showform();
            XUI.hideWait();
        });
        self.loadQueue.executeNext();
    };

    this.getOrderRow = function () {
        var self = this;

        self.OrowNum = 0;
        if (self.orders && self.orders.length) {
            for (var iNumber = 0; iNumber < self.orders.length; iNumber++) {
                self.loadQueue.pushHandler(self, function () {
                    XDocs.loadDocument(self.orders[self.OrowNum].get("DOCUMENTKEY"), false, function (e) {
                        XUI.showExceptionMsgBox(e);
                    },
                        function (loadedDocStore) {
                            try {
                                if (loadedDocStore == null) {
                                    self.OrowNum++;
                                    self.loadQueue.executeNext();
                                    return;
                                }
                                var dep = loadedDocStore.getAt(0);
                                self.orderRows.push(dep.getSubEntityStore(SFConstants.ORDERROW));
                                self.OrowNum++;
                                self.loadQueue.executeNext();
                            } catch (e) {
                                if (e)
                                    XUI.showExceptionMsgBox(e);
                            }
                        });
                });
            }

        };
    }

    this.getCustomerVisit = function () {
        var self = this;

        self.CVrowNum = 0;
        if (self.visitedCustomer && self.visitedCustomer.length) {
            for (var iNumber = 0; iNumber < self.visitedCustomer.length; iNumber++) {
                self.loadQueue.pushHandler(self, function () {
                    XDocs.loadDocument(self.visitedCustomer[self.CVrowNum].get("DOCUMENTKEY"), false, function (e) {
                        XUI.showExceptionMsgBox(e);
                    },
                        function (loadedDocStore) {
                            try {
                                if (loadedDocStore == null) {
                                    self.CVrowNum++;
                                    self.loadQueue.executeNext();
                                    return;
                                }
                                var visit = loadedDocStore.getAt(0);
                                self.visitRows.push(visit.getSubEntityStore("MVCustomerSurvey"));
                                self.CVrowNum++;
                                self.loadQueue.executeNext();
                            } catch (e) {
                                if (e)
                                    XUI.showExceptionMsgBox(e);
                            }
                        });
                });
            }

        };
    }

    this.getOBJRow = function () {
        var self = this;
        //self.objectivesTable;
        self.OBJrowNum = 0;
        var objectives = [];
        if (self.objectivesTable && self.objectivesTable.length) {
            for (var iNumber = 0; iNumber < self.objectivesTable.length; iNumber++) {
                var row = self.objectivesTable[iNumber];
                self.loadQueue.pushHandler(self, (function (idObjective) {
                    return function () {
                        SfaCacheManager.getFromCache({
                            entityName: SfaCacheManagerNamespace.CacheObjects.OBJECTIVES,
                            idObjective: idObjective,
                            onFailure: function (e) {
                                XLog.logErr("Could not retrive objectives from cache with id: ", idObjective);
                                if (onSuccess)
                                    onSuccess(self.objectiveRows);
                            },
                            onSuccess: function (obj) {
                                try {
                                    if (obj) {
                                        self.objectiveRows.push(obj);
                                    }
                                    self.loadQueue.executeNext();
                                } catch (e) {
                                    XLog.logErr("Could not retrive objectives from cache with id: ", idObjective);
                                    if (onSuccess)
                                        onSuccess(objectives);
                                }
                            }
                        });
                    };
                })(row.get("IDOBJECTIVE")));
            }
        }
    };

    this.getEncashmentRows = function () {
        if (UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVIGATE") || UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVDATA")) {
            var self = this;

            var constraints = new XConstraints({
                logicalOp: 'AND',
                constraints: [
                    { attr: 'DTEDEP', op: '=', value: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toString() },
                    { attr: 'CODDIV', op: '=', value: UserContext.CodDiv },
                    { attr: 'CODUSR', op: '=', value: UserContext.CodUsr }
                ]
            });
            self.encashment = XNavHelper.getNavRecords("NAV_MOB_DEPOSIT", constraints);

            self.ErowNum = 0;
            if (self.encashment && self.encashment.length) {
                for (var iNumber = 0; iNumber < self.encashment.length; iNumber++) {
                    self.loadQueue.pushHandler(self, function () {
                        XDocs.loadDocument(self.encashment[self.ErowNum].get("DOCUMENTKEY"), false, function (e) {
                            XUI.showExceptionMsgBox(e);
                        },
                            function (loadedDocStore) {
                                try {
                                    if (loadedDocStore == null) {
                                        self.ErowNum++;
                                        self.loadQueue.executeNext();
                                        return;
                                    }
                                    var dep = loadedDocStore.getAt(0);
                                    self.encashmentRows.push(dep.getSubEntityStore("Encashment"));
                                    self.ErowNum++;
                                    self.loadQueue.executeNext();
                                } catch (e) {
                                    if (e)
                                        XUI.showExceptionMsgBox(e);
                                }
                            });
                    });
                }

            };
        }
    };

    // return Negative Calls (Executed Visit without Sales Document linked) - Report 3
    this.getNegativeCalls = function () {
        var self = this;
        var countNegative = self.visitedCustomer.length;
        var visitOrders;
        var bool;
        for (var k = 0; k < self.visitRows.length; k++) {
            bool = false;
            for (var i = 0; i < self.visitRows[k]._entities.length; i++) {
                if (self.visitRows[k]._entities[i].get('CODTYPSURVEY') == 'ORDER' && !bool) {
                    for (var q = 0; q < self.visitRows[k]._entities[i].getSubEntityStore("MVCustomerSurveyRow")._entities.length; q++) {
                        if (self.visitRows[k]._entities[i].getSubEntityStore("MVCustomerSurveyRow")._entities[q].get('CODART') == 'N/A'
                                && self.visitRows[k]._entities[i].getSubEntityStore("MVCustomerSurveyRow")._entities[q].get('STRMEASURE5') == 'Y') {
                            visitOrders = XNavHelper.getNavRecords("NAV_MOB_ORDERS", new XConstraint("IDSURVEY", "=", self.visitRows[k]._entities[i].getSubEntityStore("MVCustomerSurveyRow")._entities[q].get('IDSURVEY')));
                            for (var ord = 0; ord < visitOrders.length; ord++) {
                                if (UserContext.getRefdatValue("CTORD", visitOrders[ord].get("CODTYPORD"), "MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES && (visitOrders[ord].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (visitOrders[ord].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (visitOrders[ord].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)) {
                                    bool = true;
                                    break;
                                }
                            }
                            if (bool) countNegative--;
                        }
                    }
                }
            }
        }

        return countNegative;
    };

    // return Negative Calls % (Executed Visit without Sales Document linked vs. Total Executed Visit) - Report 3
    this.getNegativeCallsPerc = function () {
        var self = this;
        if (self.visitedCustomer.length != 0) {
            return parseInt((self.NegativeCalls / self.visitedCustomer.length) * 100);
        } else {
            return 0;
        }
    };

    // return Positive Calls % (Executed Visit with Sales Document linked vs. Total Executed Visit) - Report 3
    this.getPositiveCallsPerc = function () {
        var self = this;
        if (self.visitedCustomer.length != 0) {
            return parseInt(((self.visitedCustomer.length - self.NegativeCalls) / self.visitedCustomer.length) * 100);
        } else {
            return 0;
        }
    };

    // return Average Drop Size % (Total Sales / Number of invoice taken) - Report 3
    this.getAvgDropSize = function () {
        var self = this;
        var sum = 0;
        var invoiceTaken = 0;
        for (var i = 0, l = self.orders.length; i < l; i++) {
            if (UserContext.getRefdatValue("CTORD", self.orders[i].get("CODTYPORD"), "MACROTYPE") == SalesForceNameSpace.OrderMacroType.SALES && (self.orders[i].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orders[i].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orders[i].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)) {
                invoiceTaken++;
                sum = sum + self.orders[i].get("NETAMOUNT") + self.orders[i].get("TAXAMOUNT");
            }
        }
        if (invoiceTaken == 0) {
            return 0;
        } else {
            return parseInt(sum / invoiceTaken);
        }
    };

    //#region REPORT

    // Report1: Daily Sales & Perish by QTY and Customer
    this.createReport1 = function () {
        var self = this;

        /*Ext.Viewport.un('orientationchange', self.handleOrientationChange, self);
        Ext.Viewport.on('orientationchange', self.handleOrientationChange, self);*/

        var custSum;
        var custOrd = [];
        var count;
        var constr;
        var convCache;

        for (var iOrd = 0, lOrd = self.orders.length; iOrd < lOrd; iOrd++) {
            count = 0;
            if (iOrd == 0) {
                custOrd.push(self.orders[iOrd].get("CODCUSTDELIV"));
            } else {
                for (var i = 0, l = custOrd.length; i < l; i++) {
                    if (custOrd[i] == self.orders[iOrd].get("CODCUSTDELIV")) {
                        count++;
                    }
                }
                if (count == 0) custOrd.push(self.orders[iOrd].get("CODCUSTDELIV"));
            }
        }
        self.custOrd = custOrd;
        if (custOrd && custOrd.length > 0) {
            var custRows = custOrd;
            custSum = [];
            for (var iCust = 0, lCust = custRows.length; iCust < lCust; iCust++) {
                var salesQty = 0;
                var perishQty = 0;
                var datemod = "";
                for (var iOrd = 0, lOrd = self.orders.length; iOrd < lOrd; iOrd++) {
                    if (custRows[iCust] == self.orders[iOrd].get("CODCUSTDELIV")) {
                        for (var iOrdRow = 0, lOrdRow = self.orderRows.length; iOrdRow < lOrdRow; iOrdRow++) {
                            if (self.orderRows[iOrdRow]._entities[0].get("NUMORD") == self.orders[iOrd].get("NUMORD") && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orders[iOrd].get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)) {
                                for (var i = 0; i < self.orderRows[iOrdRow]._entities.length; i++) {
                                    if ((self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.ANNULLATA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.SOSPESA) && (self.orderRows[iOrdRow]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA)) {
                                        if (self.orderRows[iOrdRow]._entities[i].get("CODTYPROW") == SalesForceNameSpace.OrderCTORD.SALES) {
                                            if (self.t010UmTo == "") {
                                                salesQty = salesQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                            } else {
                                                constr = new XConstraints({
                                                    logicalOp: 'AND',
                                                    constraints: [
                                                        { attr: 'UMTO', op: '=', value: self.t010UmTo },
                                                        { attr: 'UMFROM', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("UMORD") },
                                                        { attr: 'CODART', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("CODART") },
                                                        { attr: 'CODDIV', op: '=', value: UserContext.CodDiv }
                                                    ]
                                                });
                                                convCache = XNavHelper.getFromMemoryCache("NAV_MOB_PRODUMCONV").filterByConstraints(constr);
                                                if (convCache[0]) {
                                                    salesQty = salesQty + parseInt((self.orderRows[iOrdRow]._entities[i].get("QTYORD")) * parseFloat(convCache[0].get("VALCONVFACT")));
                                                } else {
                                                    salesQty = salesQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                                }
                                            }
                                        } else if (self.orderRows[iOrdRow]._entities[i].get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.PERISH) {
                                            if (self.t010UmTo == "") {
                                                perishQty = perishQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                            } else {
                                                constr = new XConstraints({
                                                    logicalOp: 'AND',
                                                    constraints: [
                                                        { attr: 'UMTO', op: '=', value: self.t010UmTo },
                                                        { attr: 'UMFROM', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("UMORD") },
                                                        { attr: 'CODART', op: '=', value: self.orderRows[iOrdRow]._entities[i].get("CODART") },
                                                        { attr: 'CODDIV', op: '=', value: UserContext.CodDiv }
                                                    ]
                                                });
                                                convCache = XNavHelper.getFromMemoryCache("NAV_MOB_PRODUMCONV").filterByConstraints(constr);
                                                if (convCache[0]) {
                                                    perishQty = perishQty + parseInt((self.orderRows[iOrdRow]._entities[i].get("QTYORD")) * parseFloat(convCache[0].get("VALCONVFACT")));
                                                } else {
                                                    perishQty = perishQty + self.orderRows[iOrdRow]._entities[i].get("QTYORD");
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (datemod == "" || datemod < self.orders[iOrd].get("DTEMOD")) {
                            datemod = self.orders[iOrd].get("DTEMOD");
                        }
                    }
                }
                if (salesQty != 0 || perishQty != 0) {
                    custSum.push(new Array(XNavHelper.getNavRecords("NAV_MOB_CUST", new XConstraint("CODPARTY", "=", custRows[iCust]))[0].get("DESPARTY1"), UserContext.formatNumber(salesQty, "###,###,##0"), UserContext.formatNumber(perishQty, "###,###,##0"), datemod));
                }
            }
        }
        if (custSum) {
            custSum = custSum.sort(
                function (a, b) {
                    a = a[3];
                    b = b[3];
                    if (a == b) {
                        return 0;
                    } else {
                        return a < b ? -1 : 1;
                    }
                }
             );
        }
        var data = ['DESPARTY1', 'SALESQTY', 'PERISHQTY'];
        var table = self.customers;

        var tableReport1 = new XDataTable;
        var cust = new XDataColumn;
        cust.Caption = UserContext.tryTranslate("[XDASHREPORT.DESPARTY1]");
        cust.Name = "DESPARTY1";
        cust.Type = "";
        cust.FormatString = '';
        cust._pos = -1;
        tableReport1.addColumn(cust);

        var salesQty = new XDataColumn;
        salesQty.Caption = UserContext.tryTranslate("[XDASHREPORT.SALESQTY]");
        salesQty.Name = "SALESQTY";
        salesQty.Type = "Int";
        salesQty.FormatString = '###,###,##0';
        salesQty._pos = -1;
        tableReport1.addColumn(salesQty);

        var perishQty = new XDataColumn;
        perishQty.Caption = UserContext.tryTranslate("[XDASHREPORT.PERISHQTY]");
        perishQty.Name = "PERISHQTY";
        perishQty.Type = "Int";
        perishQty.FormatString = '###,###,##0';
        perishQty._pos = -1;
        tableReport1.addColumn(perishQty);

        if (custSum) {
            for (var rowIdx = 0; rowIdx < custSum.length; rowIdx++) {
                tableReport1.Rows.push(new XDataRow(tableReport1, custSum[rowIdx]));
            }
        }
        table = tableReport1;
        var columns = [];
        if (data)
            columns = data;

        var html = table.toHtml({
            classTable: 'sm1-chart-data-grid-table',
            columnNames: columns
        });

        return new Ext.Panel({
            title: UserContext.tryTranslate("[XDASHREPORT.REPORT1]"),
            cls: 'sm1-gui',
            //id: '1',
            scrollable: 'vertical',
            "html": html,
            listeners: {
                painted: {
                    fn: function (pnl) {
                        var t = Ext.select('table', true, pnl.dom).elements[0];
                        //grid.setWidth(t.getWidth());
                        //grid.setHeight(t.getHeight() + 80);
                    }
                }
            }
        });
    },

    // Report21: Sales Amount by Item 
    this.createReport21 = function () {
        var self = this;

        var prodSum = [];
        var sales;
        var prodOrd = [];
        var count;
        var constr;
        for (var iOrdRow1 = 0, lOrdRow1 = self.orderRows.length; iOrdRow1 < lOrdRow1; iOrdRow1++) {
            for (var i = 0; i < self.orderRows[iOrdRow1]._entities.length; i++) {
                count = 0;
                for (var k = 0, l = prodOrd.length; k < l; k++) {
                    if (prodOrd[k] == self.orderRows[iOrdRow1]._entities[i].get("CODART")) {
                        count++;
                    }
                }
                if (count == 0) prodOrd.push(self.orderRows[iOrdRow1]._entities[i].get("CODART"));
            }
        }
        self.prodOrd = prodOrd;
        for (var iOrdRow1 = 0, lOrdRow1 = prodOrd.length; iOrdRow1 < lOrdRow1; iOrdRow1++) {
            sales = 0;
            for (var iOrdRow2 = 0, lOrdRow2 = self.orderRows.length; iOrdRow2 < lOrdRow2; iOrdRow2++) {
                for (var i = 0; i < self.orderRows[iOrdRow2]._entities.length; i++) {
                    if (prodOrd[iOrdRow1] == self.orderRows[iOrdRow2]._entities[i].get("CODART") && (self.orderRows[iOrdRow2]._parentEntity.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orderRows[iOrdRow2]._parentEntity.get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orderRows[iOrdRow2]._parentEntity.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)
                            && (self.orderRows[iOrdRow2]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.ANNULLATA) && (self.orderRows[iOrdRow2]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.SOSPESA) && (self.orderRows[iOrdRow2]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA)) {
                        if (self.orderRows[iOrdRow2]._entities[i].get("CODTYPROW") == SalesForceNameSpace.OrderCTORD.SALES) {
                            sales = sales + self.orderRows[iOrdRow2]._entities[i].get("NETAMOUNT");
                        } else if (self.orderRows[iOrdRow2]._entities[i].get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.PERISH || self.orderRows[iOrdRow2]._entities[i].get("CODTYPROW") == SalesForceNameSpace.OrderTYROW.SELLABLE_RETURN) {
                            sales = sales - self.orderRows[iOrdRow2]._entities[i].get("NETAMOUNT");
                        }
                    }
                }
            }
            if (sales != 0) {
                if (XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", prodOrd[iOrdRow1]))[0]) {
                    prodSum.push(new Array(XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", prodOrd[iOrdRow1]))[0].get("DESART"), sales, XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", prodOrd[iOrdRow1]))[0].get("ARTTYPE"), parseFloat(XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", prodOrd[iOrdRow1]))[0].get("VALVOLUME"))));
                } else {
                    prodSum.push(new Array(prodOrd[iOrdRow1], sales, "", 0));
                }
            }
        }
        if (prodSum) {
            prodSum = prodSum.sort(function (a, b) {
                if (a[3] > b[3]) return 1;
                if (a[3] < b[3]) return -1;
                if (a[2] > b[2]) return 1;
                if (a[2] < b[2]) return -1;
                return 0;
            });
        }

        var data = ['DESART', 'SALESAMOUNT'];
        var table = self.customers;

        var tableReport21 = new XDataTable;
        var cust = new XDataColumn;
        cust.Caption = UserContext.tryTranslate("[XDASHREPORT.DESART]");
        cust.Name = "DESART";
        cust.Type = "";
        cust.FormatString = '';
        cust._pos = -1;
        tableReport21.addColumn(cust);

        var salesQty = new XDataColumn;
        salesQty.Caption = UserContext.tryTranslate("[XDASHREPORT.SALESAMOUNT]");
        salesQty.Name = "SALESAMOUNT";
        salesQty.Type = "Decimal";
        salesQty.FormatString = '###,###,##0.00';
        salesQty._pos = -1;
        tableReport21.addColumn(salesQty);

        //var custTabRow = new XDataRow(prova, custSum);
        //prova.addRow(custTabRow);
        for (var rowIdx = 0; rowIdx < prodSum.length; rowIdx++) {
            tableReport21.Rows.push(new XDataRow(tableReport21, prodSum[rowIdx]));
        }
        table = tableReport21;
        var columns = [];
        if (data)
            columns = data;

        var html = table.toHtml({
            classTable: 'sm1-chart-data-grid-table',
            columnNames: columns
        });

        return new Ext.Panel({
            title: UserContext.tryTranslate("[XDASHREPORT.REPORT21]"),
            cls: 'sm1-gui',
            //id: '2',
            scrollable: 'vertical',
            "html": html,
            listeners: {
                painted: {
                    fn: function (pnl) {
                        var t = Ext.select('table', true, pnl.dom).elements[0];
                        //grid.setWidth(t.getWidth());
                        //grid.setHeight(t.getHeight() + 80);
                    }
                }
            }
        });
    },

    // Report22: Sales Amount by Customer and Item
    this.createReport22 = function () {
        var self = this;

        var custProdOrd = [];
        var prodSum = [];
        var sales;

        for (var iOrdRow1 = 0, lOrdRow1 = self.orderRows.length; iOrdRow1 < lOrdRow1; iOrdRow1++) {
            for (var i = 0; i < self.orderRows[iOrdRow1]._entities.length; i++) {
                count = 0;
                for (var k = 0, l = custProdOrd.length; k < l; k++) {
                    if (custProdOrd[k][2] == self.orderRows[iOrdRow1]._entities[i].get("CODART") & custProdOrd[k][1] == XNavHelper.getNavRecords("NAV_MOB_ORDERS", new XConstraint("NUMORD", "=", self.orderRows[iOrdRow1]._entities[i].get("NUMORD")))[0].get("CODCUSTDELIV")) {
                        count++;
                    }
                }
                if (count == 0) custProdOrd.push(new Array(self.orderRows[iOrdRow1]._entities[i].get("NUMORD"), XNavHelper.getNavRecords("NAV_MOB_ORDERS", new XConstraint("NUMORD", "=", self.orderRows[iOrdRow1]._entities[i].get("NUMORD")))[0].get("CODCUSTDELIV"), self.orderRows[iOrdRow1]._entities[i].get("CODART"), self.orderRows[iOrdRow1]._parentEntity.get("DTEMOD")));
            }
        }
        for (var iCust = 0, lCust = self.custOrd.length; iCust < lCust; iCust++) {
            for (var iProdOrd1 = 0, lProdOrd1 = self.prodOrd.length; iProdOrd1 < lProdOrd1; iProdOrd1++) {
                sales = 0;
                datemod = "";
                for (var iOrdRow2 = 0, lOrdRow2 = self.orderRows.length; iOrdRow2 < lOrdRow2; iOrdRow2++) {
                    for (var iCPO = 0, lCPO = custProdOrd.length; iCPO < lCPO; iCPO++) {
                        if (self.custOrd[iCust] == custProdOrd[iCPO][1] && self.prodOrd[iProdOrd1] == custProdOrd[iCPO][2]) { //this.orderRows[iOrdRow2]._entities[0].get("NUMORD") == custProdOrd[iCPO][0] && 
                            for (var i = 0; i < self.orderRows[iOrdRow2]._entities.length; i++) {
                                if (self.prodOrd[iProdOrd1] == self.orderRows[iOrdRow2]._entities[i].get("CODART") && (self.orderRows[iOrdRow2]._entities[i]._parentEntity.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orderRows[iOrdRow2]._entities[i]._parentEntity.get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orderRows[iOrdRow2]._entities[i]._parentEntity.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)
                                        && (self.orderRows[iOrdRow2]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.ANNULLATA) && (self.orderRows[iOrdRow2]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.SOSPESA) && (self.orderRows[iOrdRow2]._entities[i].get("CODSTATUS") != SalesForceNameSpace.OrderRowStatus.CANCELLATA)) {
                                    if (self.orderRows[iOrdRow2]._entities[i].get("CODTYPROW") == SalesForceNameSpace.OrderCTORD.SALES) {
                                        sales = sales + self.orderRows[iOrdRow2]._entities[i].get("NETAMOUNT");
                                    } else if (self.orderRows[iOrdRow2]._entities[i].get("CODTYPROW") == SalesForceNameSpaceCust.OrderTYROW.PERISH || self.orderRows[iOrdRow2]._entities[i].get("CODTYPROW") == SalesForceNameSpace.OrderTYROW.SELLABLE_RETURN) {
                                        sales = sales - self.orderRows[iOrdRow2]._entities[i].get("NETAMOUNT");
                                    }
                                }
                            }
                        }
                        if (self.custOrd[iCust] == custProdOrd[iCPO][1] && self.prodOrd[iProdOrd1] == custProdOrd[iCPO][2] && (self.orderRows[iOrdRow2]._entities[0]._parentEntity.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.SOSPESO) && (self.orderRows[iOrdRow2]._entities[0]._parentEntity.get("CODSTATUS") != SalesForceNameSpaceCust.SM1OrderStatus.CANCELLED_BY_ERP) && (self.orderRows[iOrdRow2]._entities[0]._parentEntity.get("CODSTATUS") != SalesForceNameSpace.SM1OrderStatus.ANNULLATO)) { //this.orderRows[iOrdRow2]._entities[0].get("NUMORD") == custProdOrd[iCPO][0] &&
                            if (datemod == "" || datemod < custProdOrd[iCPO][3]) {
                                datemod = custProdOrd[iCPO][3];
                            }
                        }
                    }

                }
                if (sales != 0) {        // prodSum Structure: 0:DESPARTY | 1:DESART | 2:SALES | 3:DTEMOD | 4:ARTTYPE | 5:VALVOLUME
                    if (XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", self.prodOrd[iProdOrd1]))[0]) {
                        prodSum.push(new Array(XNavHelper.getNavRecords("NAV_MOB_CUST", new XConstraint("CODPARTY", "=", self.custOrd[iCust]))[0].get("DESPARTY1"), XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", self.prodOrd[iProdOrd1]))[0].get("DESART"), sales, datemod, XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", self.prodOrd[iProdOrd1]))[0].get("ARTTYPE"), parseFloat(XNavHelper.getNavRecords("NAV_MOB_PROD", new XConstraint("CODART", "=", self.prodOrd[iProdOrd1]))[0].get("VALVOLUME"))));
                    } else {
                        prodSum.push(new Array(XNavHelper.getNavRecords("NAV_MOB_CUST", new XConstraint("CODPARTY", "=", self.custOrd[iCust]))[0].get("DESPARTY1"), self.prodOrd[iProdOrd1], sales, datemod, "", 0));
                    }
                }
            }
        }

        if (prodSum) {
            prodSum = prodSum.sort(function (a, b) {
                if (a[3] > b[3]) return 1;      // 3:DTEMOD
                if (a[3] < b[3]) return -1;
                if (a[5] > b[5]) return 1;      // 5:VALVOLUME
                if (a[5] < b[5]) return -1;
                if (a[4] > b[4]) return 1;      // 4:ARTTYPE
                if (a[4] < b[4]) return -1;
                return 0;
            });
        }

        var data = ['DESPARTY1', 'DESART', 'SALESAMOUNT'];
        var table = self.customers;

        var tableReport22 = new XDataTable;
        var cust = new XDataColumn;
        cust.Caption = UserContext.tryTranslate("[XDASHREPORT.DESPARTY1]");
        cust.Name = "DESPARTY1";
        cust.Type = "";
        cust.FormatString = '';
        cust._pos = -1;
        tableReport22.addColumn(cust);

        var prod = new XDataColumn;
        prod.Caption = UserContext.tryTranslate("[XDASHREPORT.DESART]");
        prod.Name = "DESART";
        prod.Type = "";
        prod.FormatString = '';
        prod._pos = -1;
        tableReport22.addColumn(prod);

        var salesQty = new XDataColumn;
        salesQty.Caption = UserContext.tryTranslate("[XDASHREPORT.SALESAMOUNT]");
        salesQty.Name = "SALESAMOUNT";
        salesQty.Type = "Decimal";
        salesQty.FormatString = '###,###,##0.00';
        salesQty._pos = -1;
        tableReport22.addColumn(salesQty);

        //var custTabRow = new XDataRow(prova, custSum);
        //prova.addRow(custTabRow);
        for (var rowIdx = 0; rowIdx < prodSum.length; rowIdx++) {
            tableReport22.Rows.push(new XDataRow(tableReport22, prodSum[rowIdx]));
        }
        table = tableReport22;
        var columns = [];
        if (data)
            columns = data;

        var html = table.toHtml({
            classTable: 'sm1-chart-data-grid-table',
            columnNames: columns
        });

        return new Ext.Panel({
            title: UserContext.tryTranslate("[XDASHREPORT.REPORT22]"),
            cls: 'sm1-gui',
            //id: '3',
            scrollable: 'vertical',
            "html": html,
            listeners: {
                painted: {
                    fn: function (pnl) {
                        var t = Ext.select('table', true, pnl.dom).elements[0];
                        //grid.setWidth(t.getWidth());
                        //grid.setHeight(t.getHeight() + 80);
                    }
                }
            }
        });
    },

    // Report3: Call Summary
    this.createReport3 = function () {
        var self = this;

        self.NegativeCalls = self.getNegativeCalls();
        var objVisited = [];
        var objPositive = [];
        var targetVisited = UserContext.tryTranslate("[XDASHREPORT.OBJECTIVEMISSING]");
        var targetPositive = UserContext.tryTranslate("[XDASHREPORT.OBJECTIVEMISSING]");
        for (var i = 0; i < self.objectiveRows.length; i++) {
            if (self.objectiveRows[i].CODOBJMEASURE == UserContext.getConfigParam("TOUCH_DASHREPORT_OBJ_DAILY_EXECUTED_VISIT", "")) {
                objVisited = self.objectiveRows[i].ObjectiveRowDetails;
            }
            if (self.objectiveRows[i].CODOBJMEASURE == UserContext.getConfigParam("TOUCH_DASHREPORT_OBJ_POSITIVE_CALL_PERC", "")) {
                objPositive = self.objectiveRows[i].ObjectiveRowDetails;
            }
        }
        if (objVisited.length > 0) {
            for (var i = 0; i < objVisited.length; i++) {
                if (objVisited[i].VALATTRIBUTE1 == UserContext.CodUsr) {
                    targetVisited = parseFloat(objVisited[i].VALMEASURE);
                    break;
                }
            }
        }
        if (objPositive.length > 0) {
            for (var i = 0; i < objPositive.length; i++) {
                if (objPositive[i].VALATTRIBUTE1 == UserContext.CodUsr) {
                    targetPositive = parseFloat(objPositive[i].VALMEASURE);
                    break;
                }
            }
        }
        var valueVisited;
        valueVisited = self.visitedCustomer.length + " " + UserContext.tryTranslate("[XDASHREPORT.VS]") + " " + targetVisited;
        if (self.visitedCustomer.length < targetVisited) {
            self.colorReport3Visited = "#D53032";
        }
        if (self.visitedCustomer.length > targetVisited) {
            self.colorReport3Visited = "#6cc214";
        }
        if (self.visitedCustomer.length == targetVisited) {
            self.colorReport3Visited = "#000000";
        }

        var positiveCallsPerc = self.getPositiveCallsPerc();
        var valuePositive = positiveCallsPerc + ' % ' + UserContext.tryTranslate("[XDASHREPORT.VS]") + ' ' + targetPositive + ' %';
        if (positiveCallsPerc < targetPositive) {
            self.colorReport3Positive = "#D53032";
        }
        if (positiveCallsPerc > targetPositive) {
            self.colorReport3Positive = "#6cc214";
        }
        if (positiveCallsPerc == targetPositive) {
            self.colorReport3Positive = "#000000";
        }

        return new Ext.Panel({
            title: UserContext.tryTranslate("[XDASHREPORT.REPORT3]"),
            cls: 'sm1-gui',
            //id: '4',
            scrollable: 'vertical',
            layout: {
                type: 'vbox'
            },
            items: [
                {
                    xtype: 'fieldset',
                    cls: 'sm1-gui-fieldset',
                    title: UserContext.tryTranslate('[XDASHREPORT.SUMMARY]'),
                    items: [
                        { xtype: 'textfield', label: UserContext.tryTranslate("[XDASHREPORT.TOTALCALLS]"), value: self.visits.length, disabled: true },
                        { xtype: 'textfield', id: 'targetVisited', label: UserContext.tryTranslate("[XDASHREPORT.VISITED_VS_TARGET]"), value: valueVisited, disabled: true }, //missing objective
                        { xtype: 'textfield', label: UserContext.tryTranslate("[XDASHREPORT.NOT_VISITED]"), value: self.visits.length - self.visitedCustomer.length, disabled: true },
                        { xtype: 'textfield', label: UserContext.tryTranslate("[XDASHREPORT.NEGATIVE_CALLS]"), value: self.NegativeCalls, disabled: true },
                        { xtype: 'textfield', label: UserContext.tryTranslate("[XDASHREPORT.NEGATIVE_CALLS_PERC]"), value: self.getNegativeCallsPerc() + ' %', disabled: true },
                        { xtype: 'textfield', label: UserContext.tryTranslate("[XDASHREPORT.POSITIVE_CALLS]"), value: self.visitedCustomer.length - self.NegativeCalls, disabled: true },
                        { xtype: 'textfield', id: 'targetPositive', label: UserContext.tryTranslate("[XDASHREPORT.POSITIVE_CALLS_PERC]"), value: valuePositive, disabled: true },
                        { xtype: 'textfield', label: UserContext.tryTranslate("[XDASHREPORT.AVERAGE_DROP_SIZE]"), value: UserContext.formatNumber(self.getAvgDropSize(), "###,###,##0"), disabled: true },
                    ]
                }]
        });
    },

    // Report4: 
    //      GAUGE11: Line per Call vs. Daily Target - GAUGE12: Perish/(Perish QTY/Sales QTY)% vs Target
    this.createReport4 = function () {
        var self = this;

        self.createGaugesConfig();
        var mainPan = new Ext.Panel({
            flex: 1,
            title: UserContext.tryTranslate("[XDASHREPORT.REPORT4]"),
            cls: 'sm1-panel',
            ui: 'dark',
            //id: '5',
            monitorOrientation: true,
            layout: {
                type: 'fit',
                align: 'stretch'
            }
        });
        var toolbar1 = new Ext.Toolbar({
            xtype: 'toolbar',
            docked: 'top',
            title: UserContext.tryTranslate("[XDASHREPORT.GAUGE11]"),
            cls: 'sm1-toolbar sm1-dash-chart-toolbar'
        });
        var toolbar12 = new Ext.Toolbar({
            xtype: 'toolbar',
            docked: 'top',
            title: UserContext.tryTranslate("[XDASHREPORT.TARGET]") + ": " + self.gaugesConfig[0][5] + " - " + UserContext.tryTranslate("[XDASHREPORT.AVGORDERROWS]") + ": " + self.gaugesConfig[0][6],
            cls: 'sm1-toolbar sm1-dash-chart-toolbar'
        });
        var toolbar2 = new Ext.Toolbar({
            xtype: 'toolbar',
            docked: 'top',
            title: UserContext.tryTranslate("[XDASHREPORT.GAUGE12]"),
            cls: 'sm1-toolbar sm1-dash-chart-toolbar'
        });
        var toolbar22 = new Ext.Toolbar({
            xtype: 'toolbar',
            docked: 'top',
            title: UserContext.tryTranslate("[XDASHREPORT.TARGET]") + ": " + self.gaugesConfig[1][5] + " - " + UserContext.tryTranslate("[XDASHREPORT.PERISH_VS_SALES]") + ": " + self.gaugesConfig[1][6],
            cls: 'sm1-toolbar sm1-dash-chart-toolbar'
        });
        var p = new Ext.Panel({
            flex: 1,
            cls: 'sm1-panel sm1-dash-panel',
            ui: 'dark',
            width: '48%',
            docked: 'left',
            monitorOrientation: true,
            layout: {
                type: 'fit',
                align: 'stretch'
            }
        });
        var pp = new Ext.Panel({
            flex: 1,
            cls: 'sm1-panel sm1-dash-panel',
            ui: 'dark',
            width: '48%',
            docked: 'right',
            monitorOrientation: true,
            layout: {
                type: 'fit',
                align: 'stretch'
            }
        });
        p.add(toolbar1);
        p.add(toolbar12);
        pp.add(toolbar2);
        pp.add(toolbar22);

        var c1 = new Ext.Panel({
            layout: 'fit',
            html: '<canvas width="100%" height="100%" ></canvas>',
            monitorOrientation: true,
            title: 'test',
            listeners: {
                painted: function (pnl) {
                    var w = pnl.dom.clientWidth;
                    var h = pnl.dom.clientHeight;
                    var cnv = pnl.dom.childNodes[0].childNodes[0].childNodes[0];
                    p.cnv = cnv;

                    cnv.width = w;
                    cnv.height = h;

                    var options = {
                        renderTo: cnv,
                        width: p.cnv.clientWidth,
                        height: p.cnv.clientHeight,
                        title: false,
                        minValue: 0,
                        maxValue: 100,
                        majorTicks: ['0', '20', '60', '80', '100'],
                        minorTicks: 2,
                        strokeTicks: true,
                        units: false,
                        valueFormat: { "int": 3, dec: 2 },
                        glow: true,
                        animation: false
                    };
                    var gauge = new Gauge(options);
                    p.gauge = gauge;
                    gauge.draw();
                    self._setGaugeData("Gauge11", p);
                }
            }
        });

        var c2 = new Ext.Panel({
            layout: 'fit',
            html: '<canvas width="100%" height="100%" ></canvas>',
            monitorOrientation: true,
            title: 'test',
            listeners: {
                painted: function (pnl) {
                    var w = pnl.dom.clientWidth;
                    var h = pnl.dom.clientHeight;
                    var cnv = pnl.dom.childNodes[0].childNodes[0].childNodes[0];
                    p.cnv = cnv;

                    cnv.width = w;
                    cnv.height = h;

                    var options = {
                        renderTo: cnv,
                        width: p.cnv.clientWidth,
                        height: p.cnv.clientHeight,
                        title: false,
                        minValue: 0,
                        maxValue: 100,
                        majorTicks: ['0', '20', '60', '80', '100'],
                        minorTicks: 5,
                        strokeTicks: true,
                        units: false,
                        valueFormat: { "int": 3, dec: 2 },
                        glow: true,
                        animation: false
                    };
                    var gauge = new Gauge(options);
                    p.gauge = gauge;
                    gauge.draw();
                    self._setGaugeData("Gauge12", p);
                }
            }
        });

        var cp1 = new Ext.Panel(
                {
                    xtype: 'panel',
                    title: 'test',
                    layout: 'fit',
                    items: [c1]
                });
        var cp2 = new Ext.Panel(
                {
                    xtype: 'panel',
                    title: 'test',
                    layout: 'fit',
                    items: [c2]
                });
        p.chartPanel = cp1;
        pp.chartPanel = cp2;
        p.add(cp1);
        pp.add(cp2);
        cp1.show();
        cp2.show();

        mainPan.add(p);
        mainPan.add(pp);

        return mainPan;
    },

    // Report5: 
    //      GAUGE21: Amount vs. Daily Target - GAUGE22: Cases vs. Daily Target (ONLY FOR BEVERAGE DIVISION)
    this.createReport5 = function () {
        var self = this;
        var myWidth = '98%';
        if (UserContext.CodDiv == "DFI") {
            myWidth = '48%';
        }
        var mainPan = new Ext.Panel({
            flex: 1,
            title: UserContext.tryTranslate("[XDASHREPORT.REPORT5]"),
            cls: 'sm1-panel',
            ui: 'dark',
            //id: '6',
            monitorOrientation: true,
            layout: {
                type: 'fit',
                align: 'stretch'
            }
        });
        var toolbar1 = new Ext.Toolbar({
            xtype: 'toolbar',
            docked: 'top',
            title: UserContext.tryTranslate("[XDASHREPORT.GAUGE21]"),
            cls: 'sm1-toolbar sm1-dash-chart-toolbar'
        });
        var toolbar12 = new Ext.Toolbar({
            xtype: 'toolbar',
            docked: 'top',
            title: UserContext.tryTranslate("[XDASHREPORT.TARGET]") + ": " + self.gaugesConfig[2][5] + " - " + UserContext.tryTranslate("[XDASHREPORT.TOTALAMOUNT]") + ": " + self.gaugesConfig[2][6],
            cls: 'sm1-toolbar sm1-dash-chart-toolbar'
        });

        var p = new Ext.Panel({
            flex: 1,
            cls: 'sm1-panel sm1-dash-panel',
            ui: 'dark',
            width: myWidth,
            docked: 'left',
            monitorOrientation: true,
            layout: {
                type: 'fit',
                align: 'stretch'
            }
        });
        p.add(toolbar1);
        p.add(toolbar12);

        var c1 = new Ext.Panel({
            layout: 'fit',
            html: '<canvas width="100%" height="100%" ></canvas>',
            monitorOrientation: true,
            title: 'test',
            listeners: {
                painted: function (pnl) {
                    var w = pnl.dom.clientWidth;
                    var h = pnl.dom.clientHeight;
                    var cnv = pnl.dom.childNodes[0].childNodes[0].childNodes[0];
                    p.cnv = cnv;

                    cnv.width = w;
                    cnv.height = h;

                    var options = {
                        renderTo: cnv,
                        width: p.cnv.clientWidth,
                        height: p.cnv.clientHeight,
                        title: false,
                        minValue: 0,
                        maxValue: 100,
                        majorTicks: ['0', '20', '60', '80', '100'],
                        minorTicks: 5,
                        strokeTicks: true,
                        units: false,
                        valueFormat: { "int": 3, dec: 2 },
                        glow: true,
                        animation: false
                    };
                    var gauge = new Gauge(options);
                    p.gauge = gauge;
                    gauge.draw();
                    self._setGaugeData("Gauge21", p);
                }
            }
        });
        var cp1 = new Ext.Panel(
                {
                    xtype: 'panel',
                    title: 'test',
                    layout: 'fit',
                    items: [c1]
                });
        p.chartPanel = cp1;
        p.add(cp1);
        cp1.show();
        mainPan.add(p);


        if (UserContext.CodDiv == "DFI") {
            var toolbar2 = new Ext.Toolbar({
                xtype: 'toolbar',
                docked: 'top',
                title: UserContext.tryTranslate("[XDASHREPORT.GAUGE22]"),
                cls: 'sm1-toolbar sm1-dash-chart-toolbar'
            });
            var toolbar22 = new Ext.Toolbar({
                xtype: 'toolbar',
                docked: 'top',
                title: UserContext.tryTranslate("[XDASHREPORT.TARGET]") + ": " + self.gaugesConfig[3][5] + " - " + UserContext.tryTranslate("[XDASHREPORT.QTY]") + ": " + self.gaugesConfig[3][6],
                cls: 'sm1-toolbar sm1-dash-chart-toolbar'
            });
            var pp = new Ext.Panel({
                flex: 1,
                cls: 'sm1-panel sm1-dash-panel',
                ui: 'dark',
                width: '48%',
                docked: 'right',
                //id: '5',
                monitorOrientation: true,
                layout: {
                    type: 'fit',
                    align: 'stretch'
                }
            });
            pp.add(toolbar2);
            pp.add(toolbar22);

            var c2 = new Ext.Panel({
                layout: 'fit',
                html: '<canvas width="100%" height="100%" ></canvas>',
                monitorOrientation: true,
                title: 'test',
                listeners: {
                    painted: function (pnl) {
                        var w = pnl.dom.clientWidth;
                        var h = pnl.dom.clientHeight;
                        var cnv = pnl.dom.childNodes[0].childNodes[0].childNodes[0];
                        p.cnv = cnv;

                        cnv.width = w;
                        cnv.height = h;

                        var options = {
                            renderTo: cnv,
                            width: p.cnv.clientWidth,
                            height: p.cnv.clientHeight,
                            title: false,
                            minValue: 0,
                            maxValue: 100,
                            majorTicks: ['0', '20', '60', '80', '100'],
                            minorTicks: 5,
                            strokeTicks: true,
                            units: false,
                            valueFormat: { "int": 3, dec: 2 },
                            glow: true,
                            animation: false
                        };
                        var gauge = new Gauge(options);
                        p.gauge = gauge;
                        gauge.draw();
                        self._setGaugeData("Gauge22", p);
                    }
                }
            });


            var cp2 = new Ext.Panel(
                    {
                        xtype: 'panel',
                        title: 'test',
                        layout: 'fit',
                        items: [c2]
                    });

            pp.chartPanel = cp2;
            pp.add(cp2);
            cp2.show();
            mainPan.add(pp);
        }
        return mainPan;
    },

    // Report6: Collection Detail
    this.createReport6 = function () {
        var self = this;
        if (UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVIGATE") || UserContext.checkRight("NAV_MOB_DEPOSIT", "NAV_MOB_DEPOSIT", "NAVDATA")) {
            var totalEnc = 0;
            for (var iDep = 0; iDep < self.encashmentRows.length; iDep++) {
                for (var iEnc = 0; iEnc < self.encashmentRows[iDep]._entities.length; iEnc++) {
                    totalEnc = totalEnc + self.encashmentRows[iDep]._entities[iEnc]._data.VALENC;
                }
            }
            var rowtypPay = { xtype: 'textfield', id: 'MyTextField', style: 'margin-bottom: 0.5%; margin-top: 0.5%;-webkit-text-fill-color: #005798;', label: UserContext.tryTranslate("[XDASHREPORT.ENCASHMENT]"), value: UserContext.formatNumber(totalEnc, "#,###.##"), disabled: true };
            var itemTypPay = [];
            itemTypPay.push(rowtypPay);
            var typPayAmount;
            for (var typPay in UserContext.getDecodeTable("TYPAY")) {
                typPayAmount = 0;
                for (var iDep = 0; iDep < self.encashmentRows.length; iDep++) {
                    for (var iEnc = 0; iEnc < self.encashmentRows[iDep]._entities.length; iEnc++) {
                        for (var iEncRow = 0; iEncRow < self.encashmentRows[iDep]._entities[iEnc].getSubEntityStore("EncashmentRow")._entities.length; iEncRow++) {
                            //dep.getSubEntityStore("EncashmentDetails")
                            if (self.encashmentRows[iDep]._entities[iEnc].getSubEntityStore("EncashmentRow")._entities[iEncRow]._data.CODTYPPAY == UserContext.getDecodeTable("TYPAY")[typPay].cod) {
                                typPayAmount = typPayAmount + self.encashmentRows[iDep]._entities[iEnc].getSubEntityStore("EncashmentRow")._entities[iEncRow]._data.VALENC;
                            }
                        }
                    }
                }
                rowtypPay = { xtype: 'textfield', label: UserContext.tryTranslate(UserContext.getDecodeTable("TYPAY")[typPay].des), value: UserContext.formatNumber(typPayAmount, "#,###.##"), disabled: true };
                itemTypPay.push(rowtypPay);
            }

            return new Ext.Panel({
                title: UserContext.tryTranslate("[XDASHREPORT.REPORT6]"),
                cls: 'sm1-gui',
                //id: '7',
                scrollable: 'vertical',
                layout: {
                    type: 'vbox'
                },
                items: [
                        {
                            xtype: 'fieldset',
                            cls: 'sm1-gui-fieldset',
                            id: 'hideTitle',
                            items: itemTypPay
                        }]
            });
        } else {
            return new Ext.Panel({
                flex: 1,
                title: UserContext.tryTranslate("[XDASHREPORT.REPORT6]"),
                cls: 'sm1-gui',
                //id: '7',
                visible: false,
                layout: {
                    type: 'fit',
                    align: 'stretch'
                }
            });
        }
    },

    //#endregion

    //#region Layout

    this.draw = function () {
        try {
            var self = this;
            self.rootPanel.removeAll();
            self.findCorrectLayout();

            self.chartPanels = {};

            self._createCharts();
            self._setData();
            self._firstDraw = false;

        } catch (ex) {
            XUI.showExceptionMsgBox(ex);
        }
    };

    this.doClose = function (finishHandler) {
        var self = this;
        Ext.Viewport.un('orientationchange', self.handleOrientationChange, self);
        if (finishHandler)
            finishHandler();
    };

    this.doBack = function () {
        var self = this;
        Ext.Viewport.un('orientationchange', self.handleOrientationChange, self);
        XHistory.back();
    };

    //#endregion
}


