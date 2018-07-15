import { BaseDataService } from "./baseDataService";
import { Vote } from "../entities/vote";
import { TinyRequirement } from "../entities/tinyRequirement";
import { LogExtension } from "../shared/logExtension";
import { VotingItem } from "../entities/votingItem";
import { bsNotify } from "../shared/common";
import { getClient } from "TFS/Work/RestClient";
import { TeamContext } from "TFS/Core/Contracts";
import * as service from "VSS/Service";
import * as wit from "TFS/WorkItemTracking/RestClient";
import * as _ from "lodash";

export class VotingPageService extends BaseDataService {
    private areas: string;
    private requirements: TinyRequirement[];

    private static assignedToUnassignedText: string = "";

    public votes: Vote[];
    public nothingToVote: (isThereAnythingToVote: boolean) => void;
    public initializeVotingpage: () => void;
    public numberOfMyVotes: () => number;
    public calculating: () => void;
    public getActualVotingItems: () => VotingItem[];

    constructor() {
        super();
    }

    public getRequirements(): TinyRequirement[] {
        return this.requirements;
    }

    public async loadVotes(): Promise<void> {
        const doc = await this.votingDataService.getDocument(this.documentId);
        this.votes = [];

        if (doc.vote != null && doc.vote.length > 0) {
            this.votes = doc.vote;
        }
    }

    public async getAreas(): Promise<void> {
        LogExtension.log("in require");
        const client = getClient();
        LogExtension.log("got REST-Client");
        let tempAreas = "AND ( ";

        const teamcontext: TeamContext = {
            project: null,
            projectId: this.context.project.id,
            team: null,
            teamId: this.team.id,
        };

        const teamfieldvalues = await client.getTeamFieldValues(teamcontext);
        LogExtension.log(teamfieldvalues);

        for (let i = 0; i < teamfieldvalues.values.length; i++) {
            const value = teamfieldvalues.values[i];

            tempAreas += "[System.AreaPath] UNDER '";
            tempAreas += value.value;
            tempAreas += "'";
            if (i < (teamfieldvalues.values.length - 1)) {
                tempAreas += " OR ";
            } else {
                tempAreas += " )";
            }
        }

        LogExtension.log(tempAreas);
        this.areas = tempAreas;
        LogExtension.log("finish area");
    }

    public async loadRequirements(): Promise<void> {
        this.requirements = new Array<TinyRequirement>();

        const witClient = service.getCollectionClient(wit.WorkItemTrackingHttpClient);
        const wiql = "SELECT [System.Id] FROM WorkItems WHERE [System.State] <> 'Closed' AND [System.State] <> 'Done' AND [System.State] <> 'Removed'"
            + " AND [System.WorkItemType] = '" + this.actualSetting.level + "' " + this.areas;
        const wiqlJson = {
            query: wiql,
        };

        LogExtension.log("WIQL-Abfrage: " + wiql);

        const idJson = await witClient.queryByWiql(wiqlJson, this.context.project.id);
        LogExtension.log(idJson);
        const headArray = new Array();
        let tempArray = new Array();
        LogExtension.log(idJson.workItems);
        for (let i = 0; i < idJson.workItems.length; i++) {
            const item = idJson.workItems[i];

            if ((i + 1) % 200 !== 0) {
                tempArray.push(item.id);
            } else {
                headArray.push(tempArray);
                tempArray = new Array<string>();
                tempArray.push(item.id);
            }
        }

        headArray.push(tempArray);

        for (const array of headArray) {
            try {
                if (array == null || array.length == 0) {
                    continue;
                }

                const result = await witClient.getWorkItems(array);
                for (const req of result) {
                    LogExtension.log(req);

                    const tempRequirement = new TinyRequirement();
                    tempRequirement.id = req.id;
                    if (req.fields["Microsoft.VSTS.Common.StackRank"] !== undefined) {
                        tempRequirement.order = req.fields["Microsoft.VSTS.Common.StackRank"];
                    } else if (req.fields["Microsoft.VSTS.Common.BacklogPriority"] !== undefined) {
                        tempRequirement.order = req.fields["Microsoft.VSTS.Common.BacklogPriority"];
                    } else {
                        tempRequirement.order = "0";
                    }
                    tempRequirement.title = req.fields["System.Title"];
                    tempRequirement.workItemType = req.fields["System.WorkItemType"];
                    tempRequirement.state = req.fields["System.State"];
                    tempRequirement.size = req.fields["Microsoft.VSTS.Scheduling.Size"];
                    tempRequirement.valueArea = req.fields["Microsoft.VSTS.Common.BusinessValue"];
                    tempRequirement.iterationPath = req.fields["System.IterationPath"];
                    tempRequirement.assignedTo = this.getNameOfWiResponsiveness(req);
                    tempRequirement.description = req.fields["System.Description"];

                    this.requirements.push(tempRequirement);
                }
            } catch (err) {
                LogExtension.log("Error at getWorkItems()");
                LogExtension.log(err);
                this.nothingToVote(false);
            }
        }
    }

    public async saveVote(vote: Vote) {
        const doc = await this.votingDataService.getDocument(this.documentId);

        const voting = doc.voting;
        const isEnabled = voting.isVotingEnabled;

        if (isEnabled) {
            let multipleVotes = doc.vote.some(vote => vote.userId === vote.userId
                && vote.votingId === vote.votingId
                && vote.workItemId === vote.workItemId);

            if ((this.actualSetting.numberOfVotes - this.numberOfMyVotes()) < 1) {
                bsNotify("warning", "You have no vote remaining. \nPlease refresh your browser window to get the actual content.");
                return;
            } else {
                if (!voting.isMultipleVotingEnabled && multipleVotes) {
                    bsNotify("warning", "You cannot vote again for this Item. Please refresh your browser window to get the actual content.");
                    return;
                } else {
                    doc.vote.push(vote);
                    const uDoc = await this.votingDataService.updateDocument(doc);
                    LogExtension.log("saveVote: document updated", uDoc.id);

                    bsNotify("success", "Your vote has been saved.");

                    this.initializeVotingpage();
                }
            }
        } else {
            bsNotify("warning", "This voting has been stopped. \nPlease refresh your browser windot to get the actual content.");
        }
    }

    public async deleteVote(id: number, userId: string) {
        const doc = await this.votingDataService.getDocument(this.documentId);
        if (doc == null) {
            bsNotify("warning", "This voting has been stopped. \nPlease refresh your browser windot to get the actual content.");
            return;
        }

        let isEnabled = doc.voting.isVotingEnabled;
        if (isEnabled) {
            LogExtension.log("Item Id", id);

            for (let i = 0; i < doc.vote.length; i++) {
                const item = doc.vote[i];

                if (item.workItemId === id) {
                    LogExtension.log(item.workItemId, id);
                    if (item.userId === userId) {
                        doc.vote.splice(i, 1);
                        break;
                    }
                }
            }

            const uDoc = await this.votingDataService.updateDocument(doc);
            LogExtension.log("deleteVote: document updated", uDoc.id);

            bsNotify("success", "Your vote has been deleted.");

            this.initializeVotingpage();
        }
    }

    public async updateBacklog(wis: VotingItem[], firstBacklogItem: VotingItem) {
        LogExtension.log("begin updating");

        const order = this.getTemplate();
        let success = true;

        for (let i = 0; i < wis.length; i++) {
            const item = wis[i];

            const newOrder = (parseInt(firstBacklogItem.order) - (i + 1));
            const comment = "Updated by AIT Voting Extension";
            const pathOrder = "/fields/" + order;
            const pathComment = "/fields/System.History";
            const newJson = [
                {
                    op: "replace",
                    path: pathOrder,
                    value: newOrder,
                },
                {
                    op: "add",
                    path: pathComment,
                    value: comment,
                },
            ];

            const witClient = wit.getClient();

            try {
                await witClient.updateWorkItem(newJson, item.id);
                LogExtension.log("replace success: " + item.id);
            } catch (err) {
                LogExtension.log("replace failed: " + item.id + ", trying to add...");
                const addJson = [
                    {
                        op: "add",
                        path: pathOrder,
                        value: newOrder,
                    },
                    {
                        op: "add",
                        path: pathComment,
                        value: comment,
                    },
                ];

                witClient.updateWorkItem(addJson, item.id).then((result) => {
                    LogExtension.log("add success: " + item.id);
                }, (error) => {
                    LogExtension.log(error);
                });

                success = false;
            }
        }

        if (success) {
            bsNotify("success", "Your Backlog has been successfully updated.");
        } else {
            bsNotify("danger", "An error occured.\nPlease refresh the page and try again");
        }
    }

    public async applyToBacklog() {
        try {
            await this.loadVoting();
            await this.loadVotes();
            await this.getAreas();
            await this.loadRequirements();

            this.calculating();

            const votingItems = this.getActualVotingItems();
            LogExtension.log("VotingItems: ", votingItems);

            votingItems.sort((a, b) => {
                return parseInt(a.order) - parseInt(b.order);
            });
            const tempItem = votingItems[0];
            votingItems.sort((a, b) => {
                return a.allVotes - b.allVotes;
            });

            for (let idx = 0; idx < votingItems.length; idx++) {
                const item = votingItems[idx];

                if (item.allVotes > 0) {
                    votingItems.splice(0, idx);
                    return false;
                }
            }

            this.updateBacklog(votingItems, tempItem);
        } catch (err) {
            bsNotify("danger", "An error occured.\nPlease refresh the page and try again");
        }
    }

    public async removeAllUservotes(userId: string) {
        const docs = await this.votingDataService.getAllVotings();

        try {
            for (const doc of docs) {
                doc.vote = doc.vote.filter((vote) => vote.userId !== userId);
                this.votingDataService.updateDocument(doc);
            }

            bsNotify("success", "Your votes have been successfully removed.");
            this.initializeVotingpage();
        } catch (e) {
            LogExtension.log(e);
        }
    }

    private getNameOfWiResponsiveness(req: any): string {
        const assignedTo = req.fields["System.AssignedTo"];
        const displayName = (assignedTo === undefined) ? VotingPageService.assignedToUnassignedText : assignedTo.displayName;
        return displayName;
    }
}