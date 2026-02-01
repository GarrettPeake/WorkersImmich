/**
 * Partner service -- Workers-compatible version.
 *
 * Core business logic for partner CRUD operations.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import type { ServiceContext } from 'src/context';
import { AccessRepository } from 'src/repositories/access.repository';
import { PartnerRepository } from 'src/repositories/partner.repository';
import { requireAccess } from 'src/utils/access';

export class PartnerService {
  private partnerRepository: PartnerRepository;
  private accessRepository: AccessRepository;

  constructor(private ctx: ServiceContext) {
    this.partnerRepository = new PartnerRepository(ctx.db);
    this.accessRepository = new AccessRepository(ctx.db);
  }

  async create(auth: AuthDto, dto: { sharedWithId: string }) {
    const partnerId = { sharedById: auth.user.id, sharedWithId: dto.sharedWithId };
    const exists = await this.partnerRepository.get(partnerId);
    if (exists) {
      throw new Error('Partner already exists');
    }

    const partner = await this.partnerRepository.create(partnerId);
    return this.mapPartner(partner, 'shared-by');
  }

  async remove(auth: AuthDto, sharedWithId: string): Promise<void> {
    const partnerId = { sharedById: auth.user.id, sharedWithId };
    const partner = await this.partnerRepository.get(partnerId);
    if (!partner) {
      throw new Error('Partner not found');
    }

    await this.partnerRepository.remove(partnerId);
  }

  async search(auth: AuthDto, dto: { direction?: string }) {
    const partners = await this.partnerRepository.getAll(auth.user.id);
    const key = dto.direction === 'shared-by' ? 'sharedById' : 'sharedWithId';
    return partners
      .filter((partner: any) => !!(partner.sharedBy && partner.sharedWith))
      .filter((partner: any) => partner[key] === auth.user.id)
      .map((partner: any) => this.mapPartner(partner, dto.direction || 'shared-with'));
  }

  async update(auth: AuthDto, sharedById: string, dto: { inTimeline?: boolean }) {
    await requireAccess(this.accessRepository, {
      auth,
      permission: Permission.PartnerUpdate,
      ids: [sharedById],
    });
    const partnerId = { sharedById, sharedWithId: auth.user.id };
    const entity = await this.partnerRepository.update(partnerId, {
      inTimeline: dto.inTimeline !== undefined ? (dto.inTimeline ? 1 : 0) : undefined,
    });
    return this.mapPartner(entity, 'shared-with');
  }

  private mapPartner(partner: any, direction: string) {
    const user = direction === 'shared-by' ? partner.sharedWith : partner.sharedBy;
    return {
      ...user,
      inTimeline: Boolean(partner.inTimeline),
    };
  }
}
