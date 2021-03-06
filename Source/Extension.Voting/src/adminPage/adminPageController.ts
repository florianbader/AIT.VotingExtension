﻿import { Voting } from "../entities/voting";
import { AdminPageService } from "./adminPageService";
import { LogExtension } from "../shared/logExtension";
import { bsNotify, escapeText } from "../shared/common";
import * as controls from "VSS/Controls";
import * as menus from "VSS/Controls/Menus";
import { TreeView, TreeNode } from "VSS/Controls/TreeView";
import * as dialogs from "VSS/Controls/Dialogs";
import * as statusIndicators from "VSS/Controls/StatusIndicator";
import Vue from "vue";
import Component from "vue-class-component";
import moment from "moment";
import { VotingTypes } from "../entities/votingTypes";
import { ReportDisplayService } from "../reportPage/reportDisplayService";
import { TeamFilterDisplayService } from "../teamFilter/teamFilterDisplayService";

@Component
export class AdminPageController extends Vue {
    private readonly StandardDatePattern = "YYYY-MM-DD";
    private readonly StandardTimePattern = "HH:mm";
    private readonly StandardDateTimePattern = "YYYY-MM-DD HH:mm";
    private waitControl: statusIndicators.WaitControl;
    private menuBar: menus.MenuBar;
    private reportDisplayService: ReportDisplayService;
    private teamFilterDisplayService: TeamFilterDisplayService;
    private isTypeDirty: boolean = false;
    private isTypeLevelQueryDirty: boolean = false;
    private isVotesCountSettingsDirty: boolean = false;

    public adminPageService: AdminPageService = new AdminPageService();
    public actualVoting: Voting = new Voting();
    public actualVotingHasVotes: boolean = false;
    public types: string[] = [VotingTypes.LEVEL, VotingTypes.QUERY];
    public userIsAdmin: boolean = true;
    public showContent: boolean = false;
    public votingType: string = VotingTypes.LEVEL;
    public isPageVisible: boolean = true;


    public startDate: string = "";
    public startTime: string = "";
    public endDate: string = "";
    public endTime: string = "";

    public get levels() {
        return this.adminPageService.witLevelNames;
    }

    public get items() {
        return this.adminPageService.witTypeNames;
    }

    public get queries() {
        return this.adminPageService.flatQueryNames;
    }

    public get isAdminPageVisible() {
        return (
            (!this.actualVoting.isVotingTerminated && !this.actualVoting.isVotingEnabled) ||
            this.actualVoting.isVotingEnabled
        );
    }

    public created() {
        document.getElementById("adminPage").classList.remove("hide");
    }

    public mounted() {
        document.getElementById(this.$el.id).classList.remove("hide");
        this.adminPageService = new AdminPageService();
        this.initWaitControl("#waitContainer");
        this.initializeAdminpageAsync();
        this.$el.classList.remove("hide");
        this.reportDisplayService.subscribeToCreateNewVoting(
            this.showVotingIsExistingDialog
        );
        this.teamFilterDisplayService.subscribe(this.teamFilterChanged);
    }

    public validateInput() {
        this.actualVoting.voteLimit = Math.max(1, this.actualVoting.voteLimit);
        this.actualVoting.numberOfVotes = Math.max(
            1,
            this.actualVoting.numberOfVotes
        );
        this.isVotesCountSettingsDirty = true;

        this.createMenueBar(true);
    }

    /**
     * Helper function since direct binding runs into race-condition.
     */
    public updateVotingType() {
        if (this.actualVoting.type !== this.votingType) {
            this.isTypeDirty = true;
        }
        this.votingType = this.actualVoting.type;

        switch (this.votingType) {
            case VotingTypes.LEVEL:
                this.actualVoting.query = null;
                this.waitControl.startWait();
                this.adminPageService
                    .loadWitLevelNamesAsync()
                    .then(
                        () => this.waitControl.endWait(),
                        () => this.waitControl.endWait()
                    );
                break;
            case VotingTypes.ITEM:
                this.waitControl.startWait();
                this.adminPageService
                    .loadWitTypeNamesAsync()
                    .then(
                        () => this.waitControl.endWait(),
                        () => this.waitControl.endWait()
                    );
                break;
            case VotingTypes.QUERY:
                this.createQueryTree();
                break;
            default:
                LogExtension.log("warning:", "Unknown VotingType!");
                break;
        }
        this.createMenueBar(true);
    }

    public get isBacklogBased() {
        return this.votingType == VotingTypes.LEVEL;
    }

    public get isItemBased() {
        return this.votingType == VotingTypes.ITEM;
    }

    public get isQueryBased() {
        return this.votingType == VotingTypes.QUERY;
    }

    public get currentQueryName() {
        let current = null;
        for (const currentQuery of this.queries) {
            if (currentQuery.id === this.actualVoting.query) {
                current = currentQuery;
                break;
            }
        }
        return current ? current.name : null;
    }

    public useEndTimeChanged($event) {
        if ($event.target.checked && !this.getEndDate().isValid()) {
            let possibleEndDate = moment();
            if (this.getStartDate().isValid()) {
                possibleEndDate = this.getStartDate().add(1, "d");
            }
            this.endDate = possibleEndDate.format(this.StandardDatePattern);
            this.endTime = possibleEndDate.format(this.StandardTimePattern);
        }
    }

    public useStartTimeChanged($event) {
        if ($event.target.checked && !this.getStartDate().isValid()) {
            let startDate = moment();
            if (this.getEndDate().isValid()) {
                var endDate = this.getEndDate();
                if (!endDate.isAfter(startDate)) {
                    endDate.add(1, "d");
                    this.endDate = endDate.format(this.StandardDatePattern);
                    this.endTime = endDate.format(this.StandardTimePattern);
                }
            }

            this.startDate = startDate.format(this.StandardDatePattern);
            this.startTime = startDate.format(this.StandardTimePattern);
        }
    }

    public getStartDate(): moment.Moment {
        var currentDate = moment(this.startDate);
        if (currentDate.isValid()) {
            var startTime = moment(this.startTime, this.StandardTimePattern);
            currentDate.set({
                hours: startTime.hours(),
                minutes: startTime.minutes()
            });
        }
        return currentDate;
    }

    public getEndDate(): moment.Moment {
        var currentDate = moment(this.endDate);
        if (currentDate.isValid()) {
            var endTime = moment(this.endTime, this.StandardTimePattern);
            currentDate.set({
                hours: endTime.hours(),
                minutes: endTime.minutes()
            });
        }
        return currentDate;
    }

    public setEndDate(value: number) {
        var currentDateTime = moment().add(1, "days");
        if (value != null) {
            currentDateTime = moment(value);
        }
        this.endDate = currentDateTime.format(this.StandardDatePattern);
        this.endTime = currentDateTime.format(this.StandardTimePattern);
    }

    public setStartDate(value: number) {
        var currentDateTime = moment();
        if (value != null) {
            currentDateTime = moment(value);
        }
        this.startDate = currentDateTime.format(this.StandardDatePattern);
        this.startTime = currentDateTime.format(this.StandardTimePattern);
    }

    public isDateRangeValid(): boolean {
        return this.getStartDate().isBefore(this.getEndDate());
    }

    public actualVotingTitleChanged($event) {
        this.createMenueBar(true);
    }

    private createNewVoting() {
        this.adminPageService.deleteDocumentAsync();
        this.initVoting();
        this.showContent = true;
        this.actualVotingHasVotes = false; // New votings have no votes.
        this.updateVotingType();
        this.createMenueBar(true);
    }

    private showVotingIsExistingDialog() {
        let htmlContentString: string =
            "<html><body><div>When you create a new voting, the results of the last voting are discarded. If you need them, please copy them first.</div></body></html>";
        let dialogContent = $.parseHTML(htmlContentString);
        let dialogOptions = {
            title: "Create new voting",
            content: dialogContent,
            buttons: {
                Confirm: () => {
                    dialog.close();
                    this.reportDisplayService.setReportVisibility(false);
                    this.createNewVoting();
                },
                Cancel: () => {
                    dialog.close();
                }
            },
            hideCloseButton: true
        };
        let dialog = dialogs.show(dialogs.ModalDialog, dialogOptions);
    }

    private showSaveOnRunningVotingDialog() {
        let htmlContentString: string =
            "<html><body><div>Please note that the changes made to the settings lead to a reset of all existing votes. Do you want to continue?</div></body></html>";
        let dialogContent = $.parseHTML(htmlContentString);
        let dialogOptions = {
            title: "Save voting",
            content: dialogContent,
            buttons: {
                Confirm: async () => {
                    dialog.close();
                    if (this.isVotingValid()) {
                        await this.adminPageService.removeVotesByTeamAsync();
                        await this.saveSettingsAsync(true, false);
                    }
                },
                Cancel: () => {
                    dialog.close();
                }
            },
            hideCloseButton: true
        };
        let dialog = dialogs.show(dialogs.ModalDialog, dialogOptions);
    }

    /**
     * Initialize and binds a vote setting to this controller.
     * If origin is null or undefined, a new vote setting will be created.
     *
     * @param origin Binds a loaded setting to this contoller.
     */
    private initVoting(origin?: Voting) {
        if (origin === null || origin == undefined) {
            origin = new Voting();
            origin.created = Math.round(new Date().getTime() / 1000);
        }

        <Voting>Object.assign(this.actualVoting, origin); //assign so we keep bindings!!!
        this.actualVoting.type = this.actualVoting.type || VotingTypes.LEVEL;
        this.actualVoting.level =
            this.actualVoting.level ||
            (this.levels.length
                ? this.levels[this.levels.length - 1].id
                : null);
        this.actualVoting.item =
            this.actualVoting.item ||
            (this.items.length ? this.items[0] : null);
        this.actualVoting.query =
            this.actualVoting.query ||
            (this.queries.length ? this.queries[0].id : null);

        this.setStartDate(this.actualVoting.start);
        this.setEndDate(this.actualVoting.end);

        // if (this.actualVoting.useStartTime) {
        // }
        // if (this.actualVoting.useEndTime) {
        // }
    }

    private async initializeAdminpageAsync(): Promise<void> {
        this.waitControl.startWait();

        try {
            await this.adminPageService.loadProjectAsync();
            await this.adminPageService.loadTeamsAsync();
            await this.initAsync();
        } finally {
            this.waitControl.endWait();
        }
    }

    private async initAsync() {
        this.waitControl.startWait();

        try {
            this.initVoting(await this.adminPageService.loadVotingAsync());
            this.actualVotingHasVotes = await this.adminPageService.votingHasVotes();
            this.updateVotingType();
            this.buildAdminpage();
            this.validateReportVisibility();
            this.isTypeDirty = false;
            this.isTypeLevelQueryDirty = false;
            this.isVotesCountSettingsDirty = false;
        } finally {
            this.waitControl.endWait();
        }
    }

    private buildAdminpage() {
        this.waitControl.startWait();

        try {
            if (this.actualVoting.isVotingEnabled && !this.actualVoting.isVotingTerminated) {
                LogExtension.log("actual voting enabled");

                this.showContent = true;
                this.createMenueBar(true);
            } else {
                LogExtension.log("actual voting disabled");

                this.showContent = false;
                this.createMenueBar(false);
            }
        } finally {
            this.waitControl.endWait();
        }
    }

    private async saveSettingsAsync(
        isEnabled: boolean,
        isPaused: boolean | null = null
    ) {
        const voting = this.actualVoting;
        if (voting.useStartTime) {
            voting.start = this.getStartDate().valueOf();
        }

        if (voting.useEndTime) {
            voting.end = this.getEndDate().valueOf();
        }

        if (!this.isVotingValid()) {
            return;
        }

        voting.lastModified = Math.round(new Date().getTime() / 1000);
        voting.description = escapeText(voting.description);
        voting.team = this.adminPageService.team.id;

        voting.isVotingEnabled = isEnabled;
        voting.isVotingTerminated = false;

        if (isPaused != null) {
            voting.isVotingPaused = isPaused;
        }

        LogExtension.log("Voting:", voting);

        await this.adminPageService.saveVotingAsync(voting);
        await this.initAsync();
    }

    private async pauseVotingAsync() {
        let voting = this.actualVoting;
        voting.isVotingPaused = true;
        await this.adminPageService.saveVotingAsync(voting);
        await this.initAsync();
    }

    private async terminateVotingAsync() {
        let voting = await this.adminPageService.loadVotingAsync();
        voting.isVotingEnabled = false;
        voting.isVotingTerminated = true;
        await this.adminPageService.saveVotingAsync(voting);
        await this.initAsync();
    }

    private getMenuItems(isActive: boolean): IContributedMenuItem[] {
        if (this.actualVoting == null || !this.actualVoting.isVotingEnabled) {
            if (!isActive) {
                return [
                    {
                        id: "createNewVoting",
                        text: "Create new voting",
                        icon: "icon icon-add",
                        disabled: !this.userIsAdmin
                    }
                ];
            }
        }

        const items = [
            <any>{
                id: "saveSettings",
                text: "Save",
                title: "Save voting",
                icon: "icon icon-save",
                disabled: !this.userIsAdmin || !this.canSave()
            }
        ];

        if (this.actualVoting.isVotingPaused) {
            items.push({
                id: "resumeVoting",
                title: "Resume voting",
                icon: "icon icon-play",
                disabled: !this.userIsAdmin || !this.canResume()
            });
        } else {
            items.push({
                id: "pauseVoting",
                title: "Pause voting",
                icon: "icon icon-pause",
                disabled: !this.userIsAdmin || !this.canPause()
            });
        }

        items.push({
            id: "terminateVoting",
            title: "Stop voting",
            icon: "icon icon-tfs-build-status-canceled",
            disabled: !this.userIsAdmin || !this.canTerminate()
        });

        return items;
    }

    private createMenueBar(isActive: boolean) {
        if (this.menuBar == null) {
            this.menuBar = controls.create(
                menus.MenuBar,
                $("#menueBar-container"),
                {
                    showIcon: true,
                    executeAction: args => {
                        var command = args.get_commandName();
                        this.executeMenuAction(command);
                    }
                }
            );

            document
                .getElementById("menueBar-container")
                .classList.remove("hide");
        }

        this.menuBar.updateItems(this.getMenuItems(isActive));
    }

    private createQueryTree() {
        const that = this;
        const pathTree: any = {};
        const options = {
            nodes: []
        };

        function createPathTree() {
            for (let query of that.queries) {
                let path = query.name.split("/");
                let node = pathTree;
                for (let key of path) {
                    if (!node[key]) {
                        node[key] = {};
                    }
                    node = node[key];
                }
                node.id = query.id;
                node.path = query.name;
            }
        }

        function createNodesRecursive(root: TreeNode, pathTree: any) {
            for (let key in pathTree) {
                if (key == "id" || key == "path") {
                    root.application = { id: pathTree.id, path: pathTree.path };
                    root.icon = "bowtie-view-list query-type-icon bowtie-icon";
                    break;
                } else {
                    let node = new TreeNode(key);
                    node.expanded = true;
                    node.icon = "bowtie-icon bowtie-folder";
                    root.add(node);
                    createNodesRecursive(node, pathTree[key]);
                }
            }
        }

        function createNodes() {
            var hasAtLeastOneNode = false;
            for (let key in pathTree) {
                hasAtLeastOneNode = true;
                let node = new TreeNode(key);
                node.expanded = true;
                node.icon = "bowtie-icon bowtie-folder";
                options.nodes.push(node);
                createNodesRecursive(node, pathTree[key]);
            }

            if (!hasAtLeastOneNode) {
                let rootNode = new TreeNode("Shared Queries");
                rootNode.expanded = true;
                rootNode.icon = "bowtie-icon bowtie-folder";
                let emptyNode = new TreeNode("No queries defined");
                emptyNode.icon = "bowtie-icon bowtie-view-list query-type-icon";

                rootNode.add(emptyNode);
                options.nodes.push(rootNode);
            }
        }

        this.waitControl.startWait();
        this.adminPageService.loadFlatQueryNamesAsync().then(
            () => {
                try {
                    createPathTree();
                    createNodes();

                    $("#query-tree-container").text("");
                    controls.create(
                        TreeView,
                        $("#query-tree-container"),
                        options
                    );
                    $("#query-select-button").text(this.currentQueryName);
                } finally {
                    this.waitControl.endWait();
                }
            },
            () => this.waitControl.endWait()
        );
    }

    public votingBacklogLevelChanged() {
        this.isTypeLevelQueryDirty = true;
    }

    public queryTreeSelectionChanged(selectedNode) {
        if (selectedNode.application) {
            if (this.actualVoting.query !== selectedNode.application.id) {
                this.isTypeLevelQueryDirty = true;
            }
            $("#query-select-button").text(selectedNode.application.path);
            this.actualVoting.query = selectedNode.application.id;
        }
        this.createMenueBar(true);
    }

    private executeMenuAction(command: string) {
        switch (command) {
            case "createNewVoting":
                if (this.actualVotingHasVotes) {
                    this.showVotingIsExistingDialog();
                } else {
                    this.createNewVoting();
                }
                break;
            case "saveSettings":
                if (this.actualVoting.isVotingEnabled && (this.isTypeLevelQueryDirty || this.isTypeDirty || this.isVotesCountSettingsDirty)) {
                    this.showSaveOnRunningVotingDialog();
                } else {
                    this.saveSettingsAsync(true, false);
                }
                break;
            case "pauseVoting":
                this.pauseVotingAsync();
                break;
            case "resumeVoting":
                this.saveSettingsAsync(true, false);
                break;
            case "terminateVoting":
                this.terminateVotingAsync();
                break;
        }
    }

    public initWaitControl(element: any): statusIndicators.WaitControl {
        if (!this.waitControl) {
            this.waitControl = controls.create(
                statusIndicators.WaitControl,
                $(element),
                {
                    message: "Loading..."
                }
            );
        }
        return this.waitControl;
    }

    public validateReportVisibility() {
        let isReportVisible = false;
        if (!this.actualVoting.isVotingEnabled && this.actualVoting.isVotingTerminated) {
            isReportVisible = true;
        }
        this.reportDisplayService.setReportVisibility(isReportVisible);
    }

    private canSave(): boolean {
        const hasValidTitle =
            this.actualVoting.title != null && this.actualVoting.title != "";
        const hasValidQueryBasedType =
            (this.actualVoting.query != null &&
                this.actualVoting.query != "" &&
                this.actualVoting.isQueryBased) ||
            !this.actualVoting.isQueryBased;
        const hasValidVotesPerWorkitem = this.actualVoting.voteLimit <= this.actualVoting.numberOfVotes;

        return hasValidQueryBasedType && hasValidTitle && hasValidVotesPerWorkitem;
    }

    private canResume(): boolean {
        return this.canSave();
    }

    private canTerminate(): boolean {
        return this.canSave() && this.actualVoting.isVotingEnabled;
    }

    private canPause(): boolean {
        return this.canSave();
    }

    private teamFilterChanged(team) {
        this.adminPageService.team = team;
        this.initAsync();
    }

    private isVotingValid(): boolean {
        const voting = this.actualVoting;
        if (voting.useStartTime) {
            voting.start = this.getStartDate().valueOf();
        }

        if (voting.useEndTime) {
            voting.end = this.getEndDate().valueOf();
        }


        voting.title = escapeText(voting.title);
        if ((voting.title == null || voting.title === "")) {
            bsNotify("danger", "Please provide a title for the voting.");
            return false;
        }

        if (voting.useStartTime) {
            if (!voting.start) {
                bsNotify(
                    "danger",
                    "Invalid time period. Please make sure that start date and time is filled!"
                );
                return false;
            }
        }

        if (voting.useEndTime) {
            if (!voting.end) {
                bsNotify(
                    "danger",
                    "Invalid time period. Please make sure that end date and time is filled!"
                );
                return false;
            }
        }

        if (voting.useEndTime && voting.end < Date.now()) {
            bsNotify(
                "danger",
                "Invalid time period. Please make sure that End is in the future!"
            );
            return false;
        }
        if (voting.useEndTime && voting.useStartTime) {
            if (voting.start >= voting.end) {
                bsNotify(
                    "danger",
                    "Invalid time period. Please make sure that End is later than Start!"
                );
                return false;
            }
        }

        if (voting.voteLimit > voting.numberOfVotes) {
            bsNotify(
                "danger",
                "Invalid votes per work item. Please make sure that votes per work item do not exceed the votes per user!"
            );
            return false;
        }
        return true;
    }

}
