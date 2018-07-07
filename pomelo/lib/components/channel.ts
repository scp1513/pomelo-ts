import { Application } from "../application";
import { ChannelService, IChannelServiceOpts } from '../common/service/channelService';

export class Component extends ChannelService implements IComponent {
	static _name = '__channel__'

	constructor(app: Application, opts?: IChannelServiceOpts) {
		super(app, opts)
		app.set('channelService', this, true);
	}

}
