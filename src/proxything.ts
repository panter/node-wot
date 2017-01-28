/*
 * The MIT License (MIT)
 * Copyright (c) 2017 the thingweb community
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import logger from "./logger";

import Servient from './servient'
import ThingDescription from './td/thingdescription'
import * as TD from './td/thingdescription'
import * as TDParser from './td/tdparser'
import * as Helpers from './helpers'

interface ClientAndLink {
    client: ProtocolClient
    link: TD.TDInteractionLink
}

export default class ProxyThing implements WoT.ConsumedThing {

    readonly name: string;
    private readonly td: ThingDescription;
    private readonly srv: Servient;
    private clients: Map<string, ProtocolClient> = new Map();

    constructor(servient: Servient, td: ThingDescription) {
        this.srv = servient
        this.name = td.name;
        this.td = td;
        logger.verbose("Create ProxyThing '" + this.name + "' created");
    }

    // lazy singleton for ProtocolClient per scheme
    private getClientFor(links: TD.TDInteractionLink[]): ClientAndLink {
        if (links.length === 0) {
            throw new Error("no links for this interaction")
        }

        let schemes = links.map(link => Helpers.extractScheme(link.href))
        let cacheidx = schemes.findIndex(scheme => this.clients.has(scheme))
        
        if (cacheidx !== -1) {
            logger.verbose("chose protocol ",schemes[cacheidx])
            let client = this.clients.get(schemes[cacheidx])
            let link = links[cacheidx]
            return { client: client, link: link }
        } else {
            logger.silly("no client in cache ", cacheidx)
            let srvIdx = schemes.findIndex(scheme => this.srv.hasClientFor(scheme))
            if (srvIdx === -1) throw new Error("no suitable client")

            logger.verbose("chose protocol ",schemes[srvIdx])
            let client = this.srv.getClientFor(schemes[srvIdx]);
            if (client) {
                this.clients.set(schemes[srvIdx], client);
                let link = links[srvIdx]
                return { client: client, link: link }
            } else {
                logger.info("no suitable client availiabe")
                throw new Error("no suitable client")
            }
        }
    }

    private findInteraction(name: string, type: TD.interactionTypeEnum) {
        let res = this.td.interactions.filter((ia) => ia.interactionType === type && ia.name === name)
        return (res.length > 0) ? res[0] : null;
    }

    /**
     * Read a given property
     * @param propertyName Name of the property
     */
    getProperty(propertyName: string): Promise<any> {
        logger.verbose("getProperty '" + propertyName + "' for ProxyThing '" + this.name + "'");
        return new Promise<any>((resolve, reject) => {
            let property = this.findInteraction(propertyName, TD.interactionTypeEnum.property);
            if (!property) {
                reject(new Error("cannot find property '" + propertyName + "' in " + this.name))
            } else {
                let {client, link} = this.getClientFor(property.links);
                if (!client) {
                    reject(new Error("no suitable client found for " + link.href))
                } else {
                    logger.info("getting " + link.href);
                    resolve(client.readResource(link.href));
                }
            }
        });
    }

    /**
     * Set a given property
     * @param Name of the property
     * @param newValue value to be set
     */
    setProperty(propertyName: string, newValue: any): Promise<any> {
        logger.verbose("setProperty '" + propertyName + "' for ProxyThing '" + this.name + "'");
        return new Promise<any>((resolve, reject) => {
            let property = this.findInteraction(propertyName, TD.interactionTypeEnum.property);
            if (!property) {
                reject(new Error("cannot find Property " + propertyName + " in " + this.name))
            } else {
                let {client, link} = this.getClientFor(property.links);
                if (!client) {
                    reject(new Error("no suitable client found for " + link.href))
                } else {
                    logger.info("setting " + link.href + " to " + newValue);
                    resolve(client.writeResource(link.href, newValue));
                }
            }
        });
    }

    /** invokes an action on the target thing
     * @param actionName Name of the action to invoke
     * @param parameter optional json object to supply parameters
    */
    invokeAction(actionName: string, parameter?: any): Promise<any> {
        logger.verbose("invokeAction '" + actionName + "' for ProxyThing '" + this.name + "'");
        return new Promise<any>((resolve, reject) => {
            let action = this.findInteraction(actionName, TD.interactionTypeEnum.action);
            if (!action) {
                reject(new Error("cannot find Action '" + actionName + "' in " + this.name))
            } else {
                let {client, link} = this.getClientFor(action.links);
                logger.silly("got client for link:", client, link)
                if (!client) {
                    reject(new Error("no suitable client found for " + link.href))
                } else {
                    logger.info("invoking " + link.href);
                    resolve(client.invokeResource(link.href, parameter));
                }
            }
        });
    }

    addListener(eventName: string, listener: (event: Event) => void): ProxyThing { return this }
    removeListener(eventName: string, listener: (event: Event) => void): ProxyThing { return this }
    removeAllListeners(eventName: string): ProxyThing { return this }

    /**
     * Retrive the thing description for this object
     */
    getDescription(): Object {
        return TDParser.serializeTD(this.td);
    }
}
