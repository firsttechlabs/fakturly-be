import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendReminderEmail } from '../utils/email';
import { logger } from '../utils/logger';

// Run every day at 9 AM
export const startReminderCron = () => {
  cron.schedule('0 9 * * *', async () => {
    try {
      logger.info('Starting invoice reminder cron job');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get invoices that are due today or overdue
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          status: "UNPAID",
          dueDate: {
            lt: new Date()
          }
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
              businessName: true,
              address: true,
              phone: true
            }
          },
          customer: true,
          items: true
        }
      });

      for (const invoice of overdueInvoices) {
        try {
          // Send reminder email
          await sendReminderEmail(invoice);

          // Record the reminder
          await prisma.invoiceReminder.create({
            data: {
              invoiceId: invoice.id,
              type: invoice.dueDate < today ? 'AFTER_DUE' : 'ON_DUE',
              status: 'SENT'
            }
          });

          // Update invoice status if overdue
          if (invoice.dueDate < today && invoice.status === 'UNPAID') {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: { status: 'OVERDUE' }
            });
          }
        } catch (error) {
          logger.error(`Error processing reminder for invoice ${invoice.id}:`, error);

          // Record failed reminder
          await prisma.invoiceReminder.create({
            data: {
              invoiceId: invoice.id,
              type: invoice.dueDate < today ? 'AFTER_DUE' : 'ON_DUE',
              status: 'FAILED'
            }
          });
        }
      }

      logger.info('Completed invoice reminder cron job');
    } catch (error) {
      logger.error('Error in invoice reminder cron job:', error);
    }
  });
};