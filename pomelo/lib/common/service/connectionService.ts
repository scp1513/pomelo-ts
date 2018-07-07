import { Application } from "../../application";

interface ILoginInfo {
	loginTime: number
	uid: Uid
	address: string
}

/**
 * connection statistics service
 * record connection, login count and list
 */
export class ConnectionService {
	connCount = 0
	loginedCount = 0
	serverId: ServerId
	logined: {[uid:string]: ILoginInfo} = {}

	constructor(app: Application) {
		this.serverId = app.getServerId();
	}

	/**
	 * Add logined user.
	 *
	 * @param uid {String} user id
	 * @param info {Object} record for logined user
	 */
	addLoginedUser(uid: Uid, info: ILoginInfo) {
		if (!this.logined[uid]) {
			this.loginedCount++;
		}
		info.uid = uid;
		this.logined[uid] = info;
	}

	/**
	 * Increase connection count
	 */
	increaseConnectionCount() {
		++this.connCount;
	}

	/**
	 * Remote logined user
	 *
	 * @param uid {String} user id
	 */
	removeLoginedUser(uid: Uid) {
		if (!!this.logined[uid]) {
			this.loginedCount--;
		}
		delete this.logined[uid];
	}

	/**
	 * Decrease connection count
	 *
	 * @param uid {String} uid
	 */
	decreaseConnectionCount(uid: Uid) {
		if (this.connCount) {
			--this.connCount;
		}
		if (!!uid) {
			this.removeLoginedUser(uid);
		}
	}

	/**
	 * Get statistics info
	 *
	 * @return  statistics info
	 */
	getStatisticsInfo() {
		var list = [];
		for (var uid in this.logined) {
			list.push(this.logined[uid]);
		}

		return { serverId: this.serverId, totalConnCount: this.connCount, loginedCount: this.loginedCount, loginedList: list };
	}

}
