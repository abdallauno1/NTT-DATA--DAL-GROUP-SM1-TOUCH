//#region _mobGuiRouteExtension
function _mobGuiRouteExtension() {
    this._customer = null;
    this._customerRoutesList = null;
    this._routePartyEntity = null;
    this._routesList = null;
    this._routePartyStore = null;
    this._listContext = null;
    this._mapMarkersArray = {};
    this._routeMarkersArray = {};
    this._gmap = null;

    this._refreshRoutesList = function (cust, pos) {
        var self = this;
        var store = self._routePartyStore;
        var mainList = self._routesList;
        store.sort(function (e, d) {
            var a = parseInt(e.get("PRGVISIT"), 10);
            var b = parseInt(d.get("PRGVISIT"), 10);
            if (a == b)
                return 0;
            else if (a < b)
                return -1;
            return 1;
        });
        var i = 1;
        store.each(function (entity) {
            entity.set("PRGVISIT", i);
            entity.set("IDVISIT", i);
            i++;
            return true;
        });

        var itemOnDesiredPosition = store.getAt(pos - 1);
        var currentItem = store.findBy(function (entity) {
            if (cust == entity.get("CODPARTY"))
                return true;
            return false;
        });
        if (currentItem && itemOnDesiredPosition) {
            var aux = itemOnDesiredPosition.get("PRGVISIT");
            itemOnDesiredPosition.set("PRGVISIT", currentItem.get("PRGVISIT"));
            itemOnDesiredPosition.set("IDVISIT", currentItem.get("PRGVISIT"));
            currentItem.set("PRGVISIT", aux);
            currentItem.set("IDVISIT", aux);
        }

        store.rebindSenchaStore(mainList.getStore());
    },

    this._getCustomerRoutes = function (cust, rec) {
        var self = this;
        self._customerRoutesList.getStore().clearData();
        var exe = new ExecutionQueue();
        var customerRoutesStore = new XStore({ entityName: "Route" });
        var custRows = XNavHelper.getFromMemoryCache("NAV_MOB_ROUTES");
        if (custRows == null)
            return;
        custRows = custRows.Rows;
        for (var i = 0; i < custRows.length; i++) {
            var row = custRows[i];
            var key = row.getValueFromName("DOCUMENTKEY");
            exe.pushHandler(null, XApp.delegate(function (key, cust, rec) {
                XDocs.loadDocument(key, false, function () { }, function (loadedDocStore) {
                    try {
                        if (self._customer != cust)
                            exe.executionHandlers.length = 0;
                        if (loadedDocStore == null) {
                            return;
                        }
                        var route = loadedDocStore.getAt(0);
                        var routeParties = route.getSubEntityStore("RouteParty")._entities;
                        for (var j = 0; j < routeParties.length; j++) {
                            var routeParty = routeParties[j];
                            var routeID = rec.get("IDROUTE");
                            var codusr = rec.get("CODUSR");
                            if ((routeParty.get("CODPARTY") == cust) && (((routeParty.get("IDROUTE")) != routeID) || ((routeParty.get("CODUSR")) != codusr))) {
                                customerRoutesStore.add(route);
                                break;
                            }
                        }
                    } catch (e) {
                        self.showExceptionMsgBox(e);
                    } finally {
                        exe.executeNext();
                    }
                }
            );
            }, self, [key, cust, rec]));
        }
        exe.pushHandler(null, function () {
            if (self._customer == cust && self._customerRoutesList.getParent()) {
                customerRoutesStore.rebindSenchaStore(self._customerRoutesList.getStore());
                self._customerRoutesList.refresh();
            }
        });
        exe.executeNext();
    },

    this._setEntitySelectorConstraints = function (entitySelector) {
        var store = this._routePartyStore;
        var cust = this._customer;
        var constraints = new XConstraints({ logicalOp: 'AND' });
        store.each(function (entity) {
            if (entity.get("CODPARTY") != cust)
                constraints.add(new XConstraint("CODPARTY", "<>", entity.get("CODPARTY")));
            return true;
        });
        entitySelector.hiddenConstraints = constraints;
    },

    this._renderRouteOnMap = function () {
        var self = this;
        XUI.showWait();
        var routeParties = self._routePartyStore;
        XMap.getInstance().clearMarkers();
        XMap.getInstance().clearRoute();
        self._renderCustomersOnMap();

        var waypoints = [];
        for (var i = 0; i < routeParties.getCount() ; i++) {
            var routeParty = routeParties.getAt(i);
            var lat = routeParty.get("LAT");
            var lng = routeParty.get("LNG");
            if (lat != 0 && lng != 0 && lat != undefined && lng != undefined) {
                var pos = new google.maps.LatLng(lat, lng);
                waypoints.push({ pos: pos, name: routeParty.get("DESPARTY") });
            }
        }
        XMap.getInstance().renderRoute(waypoints, function () {
            //success
            XUI.hideWait();
        }, function () {
            XUI.hideWait();
        });
    },

    this._renderCustomersOnMap = function () {
        var self = this;
        var routeParties = self._routePartyStore;
        routeParties.sort(function (e, d) {
            var a = parseInt(e.get("PRGVISIT"), 10);
            var b = parseInt(d.get("PRGVISIT"), 10);
            if (a == b)
                return 0;
            else if (a < b)
                return -1;
            return 1;
        });
        //clear overlays
        delete self._routeMarkersArray;
        self._routeMarkersArray = {};
        //end clear overlays

        XNavHelper.getFromMemoryCache("NAV_MOB_CUST").Rows.forEach(function (customer) {
            var pos = new google.maps.LatLng(customer.get("VALLATITUDE"), customer.get("VALLONGITUDE"));
            var codparty = customer.get("CODPARTY");
            if (pos.lat() != 0 && pos.lng() != 0)
                self._createMark(pos, codparty);
        });

        routeParties.each(function (routeParty) {
            var orderNumber = routeParties.findIndex(routeParty) + 1;
            if (routeParty.get("LAT") != 0 && routeParty.get("LNG") != 0)
                self._createMark(new google.maps.LatLng(routeParty.get("LAT"), routeParty.get("LNG")), routeParty.get("CODPARTY"), orderNumber);
            return true;
        });
    },

    this._createMark = function (pos, customer, orderNumber) {
        var self = this;
        if (isNaN(pos.lat()) || (isNaN(pos.lng())))
            return;
        var openPopup = !UserContext.checkAppReadOnly() ? function () {
            var list = self._routesList;
            var listStore = list.getStore();
            if (orderNumber) {
                var index = listStore.find("CODPARTY", customer);
                self._listContext.detailGui.openSubDetailFromList(listStore, list, index, "RouteParty", self._listSectionContext);
            }
            else {
                self._newMapCustomer = customer;
                self._listContext.detailGui.newFromSelector({
                    sectionContext: self._listSectionContext,
                    sectionConfig: self._listSectionContext.config,
                    listStore: self._listSectionContext.listStore,
                    sectionPanel: self._listSectionContext.listPanel
                });
            }
        } : null;
        if (orderNumber) {
            self._routeMarkersArray[customer] = true;
            var markerUrl = XApp.getHomeUrl() + "/Resources/img/visit-pushpin.png";
        }
        else {
            var markerUrl = XApp.getHomeUrl() + "/Resources/img/POS-pushpin.png";
        }
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        if (!self._mapMarkersArray[customer]) {
            var m = XMap.getInstance().createMarker(pos, null, alphabet[orderNumber - 1], markerUrl, openPopup);
            self._mapMarkersArray[customer] = m;
        }
        else {
            //remove the old pushpin
            var m = self._mapMarkersArray[customer];
            m.setMap(null);
            //create a new one
            m = XMap.getInstance().createMarker(pos, null, alphabet[orderNumber - 1], markerUrl, openPopup);
            self._mapMarkersArray[customer] = m;
        }
        XMap.getInstance().extendBounds(pos);
    },

    this._createMap = function () {
        var self = this;
        var p = new Ext.Panel({
            flex: 1,
            layout: 'fit'
        });
        if (!google || !google.maps || !XApp.isOnline())
            return p;
        var map = XMap.getInstance(true);
        map.on({
            maprender: function (senchaMap) {
                self._gmap = senchaMap.getMap();


                var fitButton = new XButton({
                    cls: 'sm1-bt sm1-bt-distance',
                    text: UserContext.tryTranslate("[MOB.ROUTES.FITMAP]"),
                    SM1Listeners: {
                        onPress: function () {
                            map.fitBounds();
                        }
                    }
                });

                map.addControlToGoogleMap(fitButton, google.maps.ControlPosition.TOP_RIGHT);

                map.addDistancesControltoGoogleMap();

                for (var i in self._mapMarkersArray) {
                    self._mapMarkersArray[i].setMap(null);
                    delete self._mapMarkersArray[i];
                }
                delete self._mapMarkersArray;
                self._mapMarkersArray = {};

                if (XApp.isOnline()) {
                    setTimeout(function () {
                        self._renderRouteOnMap();
                        map.fitBounds();
                    }, 100);
                } else
                    p.hide();
            }
        });
        p.on({
            painted: function () {
                if (XApp.isOnline()) {
                    setTimeout(function () { if (self._gmap) self._renderRouteOnMap(); }, 100);
                } else
                    p.hide();
            }
        });
        p.add(map);
        return p;
    },

    this._refreshListAndMap = function (context, options) {
        var self = this;
        var tab = context.detailContext.gui.tabPanel.getActiveItem().tabName;
        self._refreshRoutesList(options.customer, options.prgvisit);
        if (tab == "MAP")
            self._renderRouteOnMap();
    },

    /// <summary>
    /// Calculating route travel information with the use of a google api
    /// </summary>
    this._calculateRouteTravelInformation = function (exe, route) {
        if (!google || !google.maps || !XApp.isOnline()) {
            return;
        }

        // clear previous calculations
        XMap.getInstance().setRouteResult(null);

        var ROUTE_CALCULATION_UM = UserContext.getConfigParam("ROUTE_CALCULATION_UM", "");
        if (XApp.isEmptyOrWhitespaceString(ROUTE_CALCULATION_UM) || ["KM", "MI"].indexOf(ROUTE_CALCULATION_UM) < 0)
            return;

        var USER_ROUTE_START_END = this._getUserRouteStartEndParameter();

        this._clearRouteTravelInfo(route);

        // skip the route if there are no customers in the route,
        // or there is only one customer and no travel info from user's home to the customer are required
        if (route.RoutePartyDetailsStore.getCount() < 1 || (USER_ROUTE_START_END == 0 && route.RoutePartyDetailsStore.getCount() < 2))
            return;

        XUI.showWait();

        var self = this;
        var lat, lng;
        var custGeolocation = []; // dictionary that holds every customer of the route with it's location coordinates
        var unavailableCustLoc = []; //list with customers that don't have valid coordinates        

        // order clients in the order they will be visited
        route.RoutePartyDetailsStore.sortStore(function (s1, s2) {
            return s1.get("PRGVISIT") - s2.get("PRGVISIT");
        });

        // populate dictionary with all customer codes and their geographical location
        self._loadCustomerGeolocation(route, custGeolocation, unavailableCustLoc);
        if (custGeolocation.length <= 0) {
            XUI.hideWait();

            return;
        }

        if (USER_ROUTE_START_END != 0) {
            self._loadUserGeoLocation(USER_ROUTE_START_END, custGeolocation, unavailableCustLoc);
        }

        // getting the travel info for a customer and it's successor
        exe.pushHandler(null, function () {
            XMap.getInstance().renderRoute(custGeolocation, function (directions) {
                if (!directions) {
                    exe.executeNext();
                    return;
                }

                //success
                var legs = directions.routes[0].legs;

                for (var i = 0; i < legs.length; i++) {

                    var leg = legs[i];

                    // first calculation and the distance from the user to the first customer is required 
                    if (i == 0 && USER_ROUTE_START_END != 0 && unavailableCustLoc.indexOf(UserContext.CodUsr) < 0) {
                        var firstCust = route.RoutePartyDetailsStore.findBy(function (c) {
                            return self._getRoutePartyId(c) == custGeolocation[1].id;
                        });

                        firstCust.set("DISTANCE_HOME", self._metersToKmOrMiles(leg.distance["value"], ROUTE_CALCULATION_UM));
                        firstCust.set("DRIVETIME_HOME", self._getMinutes(leg.duration["value"]));

                        continue;
                    }

                    // if last customer, and user has a valid location
                    // then set the home travel info for the last customer with a valid location
                    if (i == legs.length - 1 && USER_ROUTE_START_END == 2 && unavailableCustLoc.indexOf(UserContext.CodUsr) < 0) {
                        var lastCust = route.RoutePartyDetailsStore.findBy(function (c) {
                            return self._getRoutePartyId(c) == custGeolocation[i].id;
                        });

                        lastCust.set("DISTANCE_HOME", lastCust.get("DISTANCE_HOME") + self._metersToKmOrMiles(leg.distance["value"], ROUTE_CALCULATION_UM));
                        lastCust.set("DRIVETIME_HOME", lastCust.get("DRIVETIME_HOME") + self._getMinutes(leg.duration["value"]));

                        continue;
                    }

                    var cust = route.RoutePartyDetailsStore.findBy(function (c) {
                        // next customer
                        return self._getRoutePartyId(c) == custGeolocation[i + 1].id;
                    });

                    // set travel info from the current customer to the next one
                    cust.set("DISTANCE_PREVIOUS_CUSTOMER", self._metersToKmOrMiles(leg.distance["value"], ROUTE_CALCULATION_UM));
                    cust.set("DRIVETIME_PREVIOUS_CUSTOMER", self._getMinutes(leg.duration["value"]));
                }

                exe.executeNext();
            }, function () {
                self._clearRouteTravelInfo(route);

                XUI.showErrorMsgBox({
                    msg: UserContext.tryTranslate("[UNABLE_TO_CALCULATE_ROUTE_DISTANCE_AND_TIME]")
                });

                exe.executeNext();
            });
        });

        exe.pushHandler(null, function () {
            // calculating route's whole travel info
            var duration = 0, distance = 0;
            route.RoutePartyDetailsStore.each(function (routeParty) {
                distance += routeParty.get("DISTANCE_PREVIOUS_CUSTOMER") + routeParty.get("DISTANCE_HOME");
                duration += routeParty.get("DRIVETIME_PREVIOUS_CUSTOMER") + routeParty.get("DRIVETIME_HOME");
            });

            route.set("DISTANCE", distance);
            route.set("DRIVETIME", duration);

            // show warning with customers that don't have a valid location
            if (unavailableCustLoc.length > 0) {
                XUI.showWarnOk({ msg: UserContext.tryTranslate('[GEOLOCATION_NOT_AVAILABLE_FOR_CUSTOMERS]') + "<br/>" + unavailableCustLoc.join("<br/>") });
            }

            XUI.hideWait();

            exe.executeNext();
        });
    };

    /// <summary>
    /// returns a route party id
    /// </summary>
    this._getRoutePartyId = function (routeParty) {
        return "RouteParty" + "|" + routeParty.get("CODUSR") + "|" + routeParty.get("IDROUTE") + "|" + routeParty.get("PRGVISIT");
    };

    /// <summary>
    /// returns USER_ROUTE_START_END parameter value
    /// </summary>
    this._getUserRouteStartEndParameter = function () {
        var USER_ROUTE_START_END = UserContext.stringToNumber(UserContext.getConfigParam("USER_ROUTE_START_END", 0));
        if ([0, 1, 2].indexOf(USER_ROUTE_START_END) < 0)
            USER_ROUTE_START_END = 0;

        return USER_ROUTE_START_END;
    };

    /// <summary>
    /// Transform meters in Km or Miles
    /// </summary>
    this._metersToKmOrMiles = function (meters, unitOfMeasure) {
        if (!unitOfMeasure)
            unitOfMeasure = "KM";

        var result = (meters / 1000) * (unitOfMeasure == "KM" ? 1 : 0.621371);
        return XApp.toDecimals(result, 2);
    };

    /// <summary>
    /// Return minutes from given seconds
    /// </summary>
    this._getMinutes = function (seconds) {
        return Math.floor(seconds / 60)
    };

    /// <summary>
    /// Check is geographical location is valid
    /// </summary>
    this._isLocationValid = function (entity) {
        if (!entity)
            return false;

        var lat = entity.get("VALLATITUDE");
        var lng = entity.get("VALLONGITUDE");

        return lng != 0 && lat != 0 && lat != undefined && lng != undefined;
    };

    /// <summary>
    /// Reset the travel calculation
    /// </summary>
    this._clearRouteTravelInfo = function (route) {
        route.RoutePartyDetailsStore.each(function (cust) {
            cust.set("DISTANCE_PREVIOUS_CUSTOMER", 0);
            cust.set("DRIVETIME_PREVIOUS_CUSTOMER", 0);
            cust.set("DISTANCE_HOME", 0);
            cust.set("DRIVETIME_HOME", 0);
        });

        route.set("DISTANCE", 0);
        route.set("DRIVETIME", 0);
    };

    /// <summary>
    /// Loading into the dictionary the location coordinates for the given customers 
    /// </summary>
    this._loadCustomerGeolocation = function (route, custGeolocation, unavailableCustLoc) {
        var self = this;

        route.RoutePartyDetailsStore.each(function (cust) {
            var customerRow = XNavHelper.getFromMemoryCache("NAV_MOB_CUST").findByKey(CommonEngine.buildCustomerKey(cust.get("CODPARTY")));

            if (customerRow == null)
                return;

            if (self._isLocationValid(customerRow)) {
                var pos = new google.maps.LatLng(customerRow.get("VALLATITUDE"), customerRow.get("VALLONGITUDE"));
                custGeolocation.push({ "id": self._getRoutePartyId(cust), "pos": pos });
            }
            else {
                unavailableCustLoc.push(customerRow.get("CODPARTY"));
            }
        });
    };

    /// <summary>
    /// Loading into the dictionary the location coordinates for the given user 
    /// </summary>
    this._loadUserGeoLocation = function (startEnd, custGeolocation, unavailableCustLoc) {
        var currentUser = CommonEngine.getUserNavRow(UserContext.CodUsr, UserContext.CodDiv, UserContext.CodGrp);

        if (this._isLocationValid(currentUser)) {
            var posUser = new google.maps.LatLng(currentUser.get("VALLATITUDE"), currentUser.get("VALLONGITUDE"));

            custGeolocation.unshift({ "id": UserContext.CodUsr, "pos": posUser });

            if (startEnd == 2) {
                custGeolocation.push({ "id": UserContext.CodUsr, "pos": posUser });
            }
        }
        else {
            unavailableCustLoc.push(UserContext.CodUsr);
        }
    };

    this.preFillSection = function (context) {
        if (context.config.attrs["name"] == "editRoutePopup_customerSection") {
            this._customer = context.entity.get("CODPARTY");
            this._routePartyEntity = context.entity;
            context.entity.getFieldDef("CODPARTY").fldType = "ext_ux_entityselector";
        }
        if (context.config.attrs["name"] == "editRoutePopup_routesSection") {
            context.entity._subEntityStores.Route = new XStore({ entityName: "Route" });
        }
        if (context.config.attrs["name"] == "routeCustomersList") {
            this._listSectionContext = context;
        }
    },

    this.afterSectionCreated = function (context) {
        var self = this;
        if (context.sectionConfig.attrs["name"] == "routeCustomersList") {
            this._listContext = context;
            var list = context.panel.innerPanel.list;
            list.getStore().sort('PRGVISIT', 'ASC');
            this._routesList = list;
            this._routePartyStore = context.detailGui.entity.getSubEntityStore("RouteParty");

            list.refresh();
        }
        if (context.sectionConfig.attrs["name"] == "editRoutePopup_routesSection") {
            var mainPanel = context.panel.innerPanel;
            self._customerRoutesList = mainPanel.list;
            self._customerRoutesList.clearListeners();
        }
        if (context.sectionConfig.attrs["name"] == "editRoutePopup_customerSection") {
            self._setEntitySelectorConstraints(context.detailGui.fields.CODPARTY);
        }
        if (context.sectionConfig.attrs["name"] == "customersMap") {
            var panel = context.panel;
            var map = self._createMap();
            //TODO remove this panel and substitute with one with layout fit
            panel.setDocked('');
            panel.add(map);
            panel.setCls(panel.getCls() + ' sm1-routemapsection');
        }
    },

    this.setNavigateButtonsStatus = function (context) {
        var tab = context.gui.tabPanel.getActiveItem().tabName;
        if (!XApp.isOnline() && tab == "MAP") {
            context.enabled = false;
        }
        if (context.subGui.isNewDetail) {
            context.visible = false;
        }
    },

    this.setRemoveButtonsStatus = function (context) {
        var tab = context.gui.tabPanel.getActiveItem().tabName;
        if (!XApp.isOnline() && tab == "MAP") {
            context.enabled = false;
        }
    },

    this.validateEntity = function (detailContext) {
        var tab = detailContext.gui.tabPanel.getActiveItem().tabName;
        if (!XApp.isOnline() && tab == "MAP") {
            XUI.showWarnOk({ msg: UserContext.tryTranslate('[MOB.MAP_ACTION_WHEN_OFFLINE]') });
            return false;
        }
        return true;
    },

    this.afterOpenSubDetail = function (context) {
        var self = this;
        if (self._customer)
            self._getCustomerRoutes(self._customer, self._routePartyEntity);
        var customer = context.newEntity.get("CODPARTY");

        var afterCloseHandler = context.detailContext.afterCloseHandler;
        context.detailContext.afterCloseHandler = function (opt) {
            //change tab color from red
            var tabBar = context.detailContext.gui.tabPanel.getTabBar();
            var n = tabBar.getItems().getCount();
            for (var i = 0; i < n; i++) {
                var tabHead = tabBar.getItems().getAt(i);
                if (context.detailContext.gui.tabSubDetails[i].tabName == this.tabName) {
                    tabHead.removeCls("sm1-tab-error");
                }
            }
            //end change tab color from red
            var marker = self._mapMarkersArray[customer];
            //XMap.getInstance().deselectMarker(marker);
            if (!opt.reason) {
                if (context.detailContext.isModified || context.detailContext.isNewDetail) {
                    if (context.detailContext.detailValid) {
                        afterCloseHandler(opt);
                        //set the warning for the new RouteParty
                        context.newEntity.updateWeekdayWarning(context.parentCtrl.entity.get("WEEKDAY"));
                        //refresh the RouteParty list
                        self._refreshListAndMap(context, { customer: this.entity.get("CODPARTY"), prgvisit: this.entity.get("PRGVISIT"), fitToBounds: false });
                    } else {
                        opt.canceled = true;
                        XUI.showErrorMsgBox({
                            msg: UserContext.tryTranslate("[MOB.ROUTES.INVALIDFIELD]")
                        });
                        if (!context.isNewDetail)
                            this.entity.doRestore();
                        afterCloseHandler(opt);
                    }
                } else
                    afterCloseHandler(opt);
                return;
            }
            if (opt.reason == "NEXT" || opt.reason == "PREV") {
                if (opt.modified) {
                    if (context.detailContext.detailValid) {
                        afterCloseHandler(opt);
                        //set the warning for the new RouteParty
                        context.newEntity.updateWeekdayWarning(context.parentCtrl.entity.get("WEEKDAY"));
                        //refresh the RouteParty list
                        self._refreshListAndMap(context, { customer: this.entity.get("CODPARTY"), prgvisit: this.entity.get("PRGVISIT"), fitToBounds: false });
                    } else {
                        this.entity.doRestore();
                        afterCloseHandler(opt);
                    }
                } else
                    afterCloseHandler(opt);
                return;
            }
            if (opt.reason == "CANCEL") {
                afterCloseHandler(opt);
                return;
            }
            if (opt.reason == "REMOVE") {
                afterCloseHandler(opt);
                self._refreshListAndMap(context, { customer: this.entity.get("CODPARTY"), prgvisit: this.entity.get("PRGVISIT"), fitToBounds: false });
                return;
            }
            var f = this.fields.CODPARTY;
            delete this.gui.errorReports[f.fieldContext.fieldName];
            var f = this.fields.PRGVISIT;
            delete this.gui.errorReports[f.fieldContext.fieldName];
        };
    },

    this.newDetail = function (context) {
        var newEntity = context.newEntity;
        var parentEntity = context.parentEntity;
        newEntity.set("IDROUTE", parentEntity.get("IDROUTE"));
        newEntity.set("CODUSR", parentEntity.get("CODUSR"));
        newEntity.set("PRGVISIT", this._routePartyStore.getCount() + 1);

        var tab = context.gui.tabPanel.getActiveItem().tabName;
        if (tab == "MAP")
            newEntity.set("CODPARTY", this._newMapCustomer);
    },

    this.onEndEditEnded = function (ctrl, fieldName, newValue) {
        var self = this;
        if (fieldName == "CODPARTY") {
            if (newValue)
                self._getCustomerRoutes(newValue, self._routePartyEntity);
            else {
                var customerRoutesStore = new XStore({ entityName: "Route" });
                self._customerRoutesList.setStore(customerRoutesStore.toSenchaStore());
            }
        }
    },

    this.validateField = function (context) {
        var f = context.field;
        var gui = context.gui;
        if (f.getName() == "CODPARTY") {
            this._customer = context.newVal;
        }
        if (f.getName() == "DESROUTE") {
            if (f.getValue() == "") {
                gui.errorReports[f.fieldContext.fieldName] = { field: f, caption: f.fieldContext.caption };
                return false;
            }
            delete gui.errorReports[f.fieldContext.fieldName];
        }
        if (f.getName() == "PRGROUTE") {
            var nr = parseInt(f.getValue(), 10);
            if (nr <= 0) {
                gui.errorReports[f.fieldContext.fieldName] = { field: f, caption: f.fieldContext.caption };
                return false;
            }
            var row = XNavHelper.getNavRecord("NAV_MOB_ROUTES", new XConstraint("PRGROUTE", "=", nr));
            if (row)
                XUI.showWarnOk({
                    msg: UserContext.tryTranslate("[MOBROUTES.DUPLICATE_PRGROUTE]")
                });
            delete gui.errorReports[f.fieldContext.fieldName];
        }
        return true;
    },

    this.setFieldStatus = function (context) {
        var self = this;
        var entity = context.sectionContext.entity;

        switch (entity.getEntityName()) {
            case "Route":
                var dteStart = entity.get("DTESTART").getTime();
                var dteEnd = entity.get("DTEEND").getTime();
                switch (context.fieldName) {
                    case "PRGVISIT":
                        if (parseInt(context.field.getValue(), 10) <= 0)
                            context.valid = false;
                        break;
                    case "DESROUTE":
                        if (context.field.getValue() == "") {
                            if (self._desrouteModified != true) {
                                var desroute = "new route";
                                context.field.setValue(desroute);
                                context.gui.entity.set("DESROUTE", desroute);
                                self._desrouteModified = true;
                            }
                        }
                        break;
                    case "PRGROUTE":
                        var nr = parseInt(context.field.getValue(), 10);
                        if (nr == 0) {
                            var prgroute = 1;
                            context.field.setValue(prgroute);
                            context.gui.entity.set("PRGROUTE", prgroute);
                        }
                        break;
                    case "WEEKDAY":
                        //update clients warnings
                        entity.updateClientsWeekdayWarning(context.field.getValue());
                        //refresh the route party list
                        if (this._routesList)
                            entity.RoutePartyDetailsStore.rebindSenchaStore(this._routesList.getStore());
                        break;
                    case "DTESTART":
                        context.valid = true;
                        if (XApp.isEmptyDate(dteStart) && !XApp.isEmptyDate(dteEnd))
                            context.valid = false;
                        break;
                    case "DTEEND":
                        context.valid = true;
                        if (XApp.isEmptyDate(dteEnd) && !XApp.isEmptyDate(dteStart) ||
                            !XApp.isEmptyDate(dteStart) && !XApp.isEmptyDate(dteEnd) && dteStart > dteEnd)
                            context.valid = false;
                        break;
                }
                break;
            case "RouteParty":
                switch (context.fieldName) {
                    case "CODPARTY":
                        if (context.field.getSelectedCode() == "" && (this._customer == "" || !this._customer))
                            context.valid = false;
                        break;
                }
                break;
        }
    },

    this.validateDocument = function (detailContext) {
        var desroute = detailContext.getDocument().get("DESROUTE");
        var prgroute = detailContext.getDocument().get("PRGROUTE");
        if (desroute == "")
            return false;
        if (prgroute <= 0)
            return false;
        var dteStart = detailContext.getDocument().get("DTESTART").getTime();
        var dteEnd = detailContext.getDocument().get("DTEEND").getTime();
        if (XApp.isEmptyDate(dteStart) && !XApp.isEmptyDate(dteEnd) ||
            XApp.isEmptyDate(dteEnd) && !XApp.isEmptyDate(dteStart) ||
            !XApp.isEmptyDate(dteStart) && !XApp.isEmptyDate(dteEnd) && dteStart > dteEnd)
            return false;
        return true;
    };

    this.getQtabsVoices = function (fieldContext) {
        if (fieldContext.fieldName == "WEEKDAY") {
            fieldContext.voices.sort(function (a, b) {
                return parseInt(UserContext.getRefdatValue("WEEKDAY", a.value, "WEEKDAY_ORDER")) - parseInt(UserContext.getRefdatValue("WEEKDAY", b.value, "WEEKDAY_ORDER"));
            });
        }
    };

    this.afterNewDocument = function (gui, options) {
        var route = gui.getDocument();
        if (options.routeCopy) {
            gui.docStore.removeAll();
            options.routeCopy.set("DTECRE", new Date());
            gui.docStore.add(options.routeCopy);
            gui.setModified(gui.docStore.getAt(0));
            return;
        }
    };

    this.onSaveDocument = function (gui, document, onSuccess) {
        var exe = new ExecutionQueue();

        this._calculateRouteTravelInformation(exe, document);

        exe.pushHandler(null, function () {
            XApp.exec(onSuccess);
        });

        exe.executeNext();
    };

    this.afterNotifyLeave = function (context) {
        var self = this;
        delete self._desrouteModified;
    };

};
XApp.registerGuiExtension("mobGuiRoute", new _mobGuiRouteExtension());
//#endregion