import { AdminPageService } from "./adminPageService";
import { AdminPageController } from "./adminPageController";
import * as typemoq from "typemoq";
import flushPromises from "flush-promises";
import { Voting } from "../entities/voting";

jest.mock('VSS/Controls', () => {
    return {
        create: () => {
            return {
                startWait: () => {},
                endWait: () => {},
                updateItems: () => {}
            }
        }
    };
});

class VSS {
    ServiceIds: any;
    getWebContext(): any {}
    async getService<T>(contributionId: string): Promise<any> {}
}

const vssMock = typemoq.Mock.ofType<VSS>();
vssMock.setup(s => s.ServiceIds).returns(() => { 
    return { ExtensionData: "extensionData" };
});
vssMock.setup(s => s.getWebContext()).returns(() => {
    return {
        collection: {
            name: "Test"
        }
    };
});
(<any>window).VSS = vssMock.object;

(<any>window).$ = () => {};

const adminPageServiceMock = typemoq.Mock.ofType<AdminPageService>();
adminPageServiceMock.setup(s => s.loadAsync()).returns(() => Promise.resolve());
adminPageServiceMock.setup(s => s.loadVotingAsync()).returns(() => Promise.resolve(new Voting()));
AdminPageService.prototype = adminPageServiceMock.object;

function addElement(id: string) {
    const element = document.createElement("div");
    element.id = id;
    document.body.appendChild(element);
    return element;
}

describe('mounted', () => {
    beforeEach(() => {
        addElement('adminPage');
        addElement('menueBar-container');
    })

    it('should load data', async () => {
        const controller = new AdminPageController();
        controller.$mount("#adminPage");

        await flushPromises();

        adminPageServiceMock.verify(s => s.loadAsync(), typemoq.Times.atLeastOnce());
    });
});